import * as fs from 'fs';
import * as path from 'path';

/**
 * A small JSON file in `userData`. Reading never throws: a missing or corrupt file
 * reads as `undefined`. Writes are atomic and run one after another, so an older
 * snapshot never lands last; a failed write is logged, never thrown.
 */
export class JsonFile {
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<unknown> {
    try {
      return JSON.parse(await fs.promises.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Could not read ${this.filePath}:`, error);
      }
      return undefined;
    }
  }

  write(value: unknown): Promise<void> {
    const contents = JSON.stringify(value, null, 2);
    this.writing = this.writing.then(() => this.replaceWith(contents));
    return this.writing;
  }

  private async replaceWith(contents: string): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.promises.writeFile(tempPath, contents);
      await fs.promises.rename(tempPath, this.filePath);
    } catch (error) {
      console.error(`Could not save ${this.filePath}:`, error);
    }
  }
}
