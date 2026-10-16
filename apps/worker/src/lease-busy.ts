export class JobLeaseBusy extends Error {
  constructor(readonly until: number) { super('Background work is already leased.') }
}
