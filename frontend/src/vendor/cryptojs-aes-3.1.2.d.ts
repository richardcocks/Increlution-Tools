/*
 * Type surface for the co-located vendored CryptoJS v3.1.2 build
 * (cryptojs-aes-3.1.2.js). Only the members used by the save decoder are declared.
 */
interface CryptoJSWordArray {
  toString(encoder?: unknown): string;
}

interface CryptoJSStatic {
  AES: {
    decrypt(ciphertext: string, password: string): CryptoJSWordArray;
  };
  enc: {
    Utf8: unknown;
  };
}

declare const CryptoJS: CryptoJSStatic;
export default CryptoJS;
