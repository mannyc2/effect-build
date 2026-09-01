export const finalizeAfterTerminalObservation = async ({ validate, observe }) => {
  if (typeof validate !== "function" || typeof observe !== "function") {
    throw new Error("terminal observation capabilities are incomplete");
  }
  const result = await validate();
  await observe();
  return result;
};
