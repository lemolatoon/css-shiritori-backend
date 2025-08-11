export class Lock {
  private locked = false;
  private waiting: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (this.locked) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.locked = true;
  }

  release(): void {
    this.locked = false;
    const next = this.waiting.shift();
    if (next) next();
  }
}
