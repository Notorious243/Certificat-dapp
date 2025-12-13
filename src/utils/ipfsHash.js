// Utilitaire pour calculer le hash IPFS (CIDv0) localement
// Algorithme : Base58( 0x12 + 0x20 + SHA256(data) )

// Alphabet Base58 (Bitcoin)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_MAP = {};
for (let i = 0; i < ALPHABET.length; i++) {
    ALPHABET_MAP[ALPHABET.charAt(i)] = i;
}

function toBase58(buffer) {
    if (buffer.length === 0) return '';
    let i, j, digits = [0];
    for (i = 0; i < buffer.length; i++) {
        for (j = 0; j < digits.length; j++) digits[j] <<= 8;
        digits[0] += buffer[i];
        let carry = 0;
        for (j = 0; j < digits.length; ++j) {
            digits[j] += carry;
            carry = (digits[j] / 58) | 0;
            digits[j] %= 58;
        }
        while (carry) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }
    for (i = 0; buffer[i] === 0 && i < buffer.length - 1; i++) digits.push(0);
    return digits.reverse().map(d => ALPHABET[d]).join('');
}

export const calculateIpfsHash = async (file) => {
    // 1. Lire le fichier en ArrayBuffer
    const buffer = await file.arrayBuffer();

    // 2. Calculer le SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = new Uint8Array(hashBuffer);

    // 3. Construire le multihash (0x12 = sha2-256, 0x20 = length 32)
    const multihash = new Uint8Array(2 + hashArray.length);
    multihash[0] = 0x12;
    multihash[1] = 0x20;
    multihash.set(hashArray, 2);

    // 4. Encoder en Base58
    return toBase58(multihash);
};
