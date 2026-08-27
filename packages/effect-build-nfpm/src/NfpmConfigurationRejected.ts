import { Schema } from "effect";

/** Native nFPM configuration attempted to bypass a canonical effect-build field or trust boundary. */
export class NfpmConfigurationRejected extends Schema.TaggedError<NfpmConfigurationRejected>()(
  "NfpmConfigurationRejected",
  {
    path: Schema.NonEmptyString,
    reason: Schema.NonEmptyString,
  },
) {
  override get message(): string {
    return `nFPM configuration rejected at ${this.path}: ${this.reason}`;
  }
}
