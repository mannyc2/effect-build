const attempts = new WeakSet<object>();
const liveSubmissions = new WeakSet<object>();
const reconciledSubmissions = new WeakSet<object>();
const storedReceipts = new WeakSet<object>();
const reconciliationEvidence = new WeakSet<object>();
const observations = new WeakSet<object>();

export const registerAttempt = <A extends object>(receipt: A): A => {
  attempts.add(receipt);
  return receipt;
};

export const isAttempt = (receipt: object): boolean => attempts.has(receipt);

export const registerLiveSubmission = <A extends object>(receipt: A): A => {
  liveSubmissions.add(receipt);
  return receipt;
};

export const registerReconciledSubmission = <A extends object>(receipt: A): A => {
  reconciledSubmissions.add(receipt);
  return receipt;
};

export const isAuthorizedSubmission = (receipt: object): boolean =>
  liveSubmissions.has(receipt) || reconciledSubmissions.has(receipt);

export const registerStoredReceipt = <A extends object>(receipt: A): A => {
  storedReceipts.add(receipt);
  return receipt;
};

export const isStoredReceipt = (receipt: object): boolean => storedReceipts.has(receipt);

export const registerReconciliationEvidence = <A extends object>(evidence: A): A => {
  reconciliationEvidence.add(evidence);
  return evidence;
};

export const isReconciliationEvidence = (evidence: object): boolean => reconciliationEvidence.has(evidence);

export const registerObservation = <A extends object>(observation: A): A => {
  observations.add(observation);
  return observation;
};

export const isObservation = (observation: object): boolean => observations.has(observation);
