declare module 'multer' {
  export type StorageEngine = object;

  export type DiskStorageOptions = Readonly<{
    destination: string;
    filename: (
      request: unknown,
      file: unknown,
      callback: (error: Error | null, filename: string) => void,
    ) => void;
  }>;

  export function diskStorage(options: DiskStorageOptions): StorageEngine;
}
