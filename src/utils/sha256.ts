export async function sha256(apiUrl: string): Promise<string> {
  // 將字串轉成 Uint8Array
  const msgBuffer = new TextEncoder().encode(apiUrl);

  // 計算 SHA-256
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);

  // 轉成十六進位字串
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}
