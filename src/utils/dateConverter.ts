export function formattedDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0"); // maanden starten op 0
  const year = now.getFullYear();

  const formattedDate = `${day}-${month}-${year}`;
  return formattedDate;
}
