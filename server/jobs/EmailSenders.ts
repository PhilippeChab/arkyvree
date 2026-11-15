import { createEmailTransports } from "./emailTransports.ts";

/**
 * The ways this worker sends email (`createEmailTransports`), made once, as its first email is sent: after its start
 * checked them (`checkEmailSetup`), which stops it, in its own words, on settings that can't work.
 */
class EmailSenders {
  private transports: ReturnType<typeof createEmailTransports> | undefined;

  read() {
    this.transports ??= createEmailTransports();
    return this.transports;
  }
}

export default new EmailSenders();
