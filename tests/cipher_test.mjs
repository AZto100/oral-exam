function rotatingCaesar(text, studentNumber, direction = 1) {
  const shifts = [...studentNumber].map(Number);
  let pointer = 0, out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    let base = null;
    if (code >= 65 && code <= 90) base = 65;
    else if (code >= 97 && code <= 122) base = 97;
    if (base === null) { out += ch; continue; }
    const shift = shifts[pointer % shifts.length] * direction;
    out += String.fromCharCode(base + (((code - base + shift) % 26 + 26) % 26));
    pointer++;
  }
  return out;
}
const sn = "10962700";
const plain = "Numerical data has size values; categorical data has groups.";
const enc = rotatingCaesar(plain, sn, 1);
const dec = rotatingCaesar(enc, sn, -1);
console.log({ plain, enc, dec, ok: plain === dec });
if (plain !== dec) process.exit(1);
