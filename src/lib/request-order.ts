export class RequestOrder {
  private version = 0;
  begin() {
    return ++this.version;
  }
  invalidate() {
    this.version += 1;
  }
  isCurrent(ticket: number) {
    return ticket === this.version;
  }
}
