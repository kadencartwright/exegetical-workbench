// Only the workerd base class is adapted for Node. OAuth handlers, storage and crypto run unchanged.
export class WorkerEntrypoint { constructor(public ctx: unknown, public env: unknown) {} }
