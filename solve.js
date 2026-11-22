// A fast drop-in for csv-reader 1.0.0 (make.fun's reference CSV reader).
//
// run(input) returns csv-reader's reading of {text, header}: the JSON value
// {columns, rows, errors}, identical to the reference on every input, broken
// rows included. The reading policy is the reference's own:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled: "" inside it is one quote, and each CRLF or lone CR inside it
//     is read as LF; what follows the closing quote, up to the next comma or
//     line break, is appended as it stands (error quote_junk when the field
//     ends and anything was appended);
//   - a quote that never closes is a literal character and the text after it
//     is read again as unquoted (error unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (error short_row, with fields: its field count) or cut (error
//     long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row} in the order met: line the 1-based line
//     its record starts on (every LF, CRLF and lone CR inside quotes counts),
//     row its record's index in rows, null for the header.
//
// Where the reference walks one character at a time and builds each field a
// character at a time, this reader scans with indexOf and charCodeAt and cuts
// each field out of the text with slice, so the common field costs one scan
// and one slice. Only the characters that change a field's reading (a doubled
// quote, a CR inside quotes, a stray CR outside them) take the slow path, and
// a quoted field that never closes is found by the quote scan alone: its
// would-be content is never built, because the reference discards it too.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next.

const COMMA = 0; // the field ended at a comma: the record goes on
const BREAK = 1; // the field ended at a line break: the record ends
const END = 2; // the field ended at the end of the text: the record ends

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error of the record carries these two.
  let recordLine = 1;
  let recordRow = null;

  // The field read last: its value, how it ended, and how many characters
  // the unquoted reader kept (the quote_junk test reads the last of these).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // Reads unquoted characters onto `value` from pos, up to the next comma or
  // line break: a CR not followed by LF is dropped (stray_cr). Sets fValue,
  // fEnded and fAdded (the characters kept by this call).
  function readUnquoted(value) {
    let seg = pos; // the start of the literal run not yet taken
    let parts = null; // literal runs and kept text, once a CR is dropped
    let added = 0;
    let p = pos;
    while (p < n) {
      const c = text.charCodeAt(p);
      if (c > 13) {
        // The common character, kept as it stands; a comma ends the field.
        if (c !== 44) {
          p += 1;
          continue;
        }
        pos = p + 1;
        fEnded = COMMA;
        break;
      }
      if (c === 10) { // LF
        pos = p + 1;
        line += 1;
        fEnded = BREAK;
        break;
      }
      if (c === 13) { // CR
        if (text.charCodeAt(p + 1) === 10) { // CRLF
          pos = p + 2;
          line += 1;
          fEnded = BREAK;
          break;
        }
        // A stray CR: dropped, one error, the field goes on without it.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (parts === null) parts = [value];
        if (p > seg) {
          parts.push(text.slice(seg, p));
          added += p - seg;
        }
        p += 1;
        seg = p;
        continue;
      }
      p += 1;
    }
    if (p >= n) {
      pos = n;
      fEnded = END;
    }
    if (parts === null) {
      fValue = value + text.slice(seg, p);
      fAdded = added + (p - seg);
    } else {
      if (p > seg) {
        parts.push(text.slice(seg, p));
        added += p - seg;
      }
      fValue = parts.join('');
      fAdded = added;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue/fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = open + 1; // the scan position, just past the opening quote
    let seg = p; // the start of the literal run not yet taken
    let parts = null; // literal runs and replacements, once one is needed
    let qline = openLine; // the line the scan is on (committed at the close)

    // Counts the LF in text[from, to) onto qline.
    function countBreaks(from, to) {
      let i = text.indexOf('\n', from);
      while (i !== -1 && i < to) {
        qline += 1;
        i = text.indexOf('\n', i + 1);
      }
    }
    // Takes the literal run [seg, to) into the value being built.
    function take(to) {
      if (to > seg) {
        if (parts === null) parts = [];
        parts.push(text.slice(seg, to));
        countBreaks(seg, to);
      }
    }

    let close = -1; // the closing quote's index, once found
    while (true) {
      const q = text.indexOf('"', p);
      if (q === -1) break; // no quote left: the field never closes
      const r = text.indexOf('\r', p);
      if (r !== -1 && r < q) {
        // A CR inside the quotes before the next quote: read as one LF,
        // and a CRLF pair is one break, its LF part of the pair.
        take(r);
        if (parts === null) parts = [];
        parts.push('\n');
        qline += 1;
        p = text.charCodeAt(r + 1) === 10 ? r + 2 : r + 1;
        seg = p;
        continue;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one literal quote, the field goes on.
        take(q);
        if (parts === null) parts = [];
        parts.push('"');
        p = q + 2;
        seg = p;
        continue;
      }
      close = q;
      break;
    }

    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted. The scan's line count is undone,
      // as the reference undoes it, and its content is never built.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }

    let value;
    if (parts === null) {
      value = text.slice(seg, close);
      // No quote or CR changed the run: only its line breaks are owed.
      let i = text.indexOf('\n', seg);
      while (i !== -1 && i < close) {
        qline += 1;
        i = text.indexOf('\n', i + 1);
      }
    } else {
      take(close);
      value = parts.join('');
    }
    line = qline;
    pos = close + 1;

    if (pos >= n) {
      fValue = value;
      fEnded = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) { // ','
      pos += 1;
      fValue = value;
      fEnded = COMMA;
      return;
    }
    if (c === 10) { // LF
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { // CRLF
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break (a lone CR in it is a stray_cr, as unquoted).
    readUnquoted(value);
    if (fAdded > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
