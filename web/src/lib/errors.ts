import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const CONTRACT_ERRORS: Record<string, string> = {
  UnknownAgreement: "That agreement does not exist.",
  NotClient: "Only the client can do that.",
  NotProvider: "Only the provider can do that.",
  NotParty: "Only the two parties can do that.",
  NotAppealCourt: "Only the appeal court can resolve appeals.",
  InvalidParams: "Some details are invalid. Check the parties, amounts and windows.",
  WrongStatus: "The agreement is not in the right state for that.",
  WrongPhase: "The milestone is not in the right state for that.",
  BadMilestone: "Unknown milestone.",
  WrongValue: "The amount sent does not match.",
  UnsupportedToken: "This token is not supported.",
  TooEarly: "Too early: the relevant window has not elapsed yet.",
  TooLate: "Too late: that window has closed.",
  InvalidSignature: "The ruling signature is not valid for this dispute.",
  SignatureExpired: "The ruling signature has expired.",
  NoOffer: "There is no matching settlement offer from the other party.",
  NothingOwed: "Nothing to withdraw.",
  TransferFailed: "The transfer failed.",
  TooManyFilings: "You have reached the filing limit for this dispute.",
  ERC20InsufficientBalance: "Your token balance is too low.",
  ERC20InsufficientAllowance: "The token allowance is too low.",
};

/** Turns wallet and contract errors into one readable sentence. */
export function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You rejected the request in your wallet.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];
      if (name) return `The contract rejected this (${name}).`;
    }
    if (/insufficient funds/i.test(error.message)) return "Not enough ETH for gas. Top up from the faucet in the wallet menu.";
    return error.shortMessage || error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
