import AjvModule from "ajv";
import { irSchema } from "./schema.js";
import type { IrDocument } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = AjvModule as any;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  document: IrDocument | null;
}

export function validateIrDocument(data: unknown): ValidationResult {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(irSchema);
  const valid = validate(data);

  if (valid) {
    return {
      valid: true,
      errors: [],
      document: data as IrDocument,
    };
  }

  const errors = ((validate.errors ?? []) as Array<{ instancePath?: string; message?: string }>).map(
    (err) => {
      const path = err.instancePath || "(root)";
      return `${path}: ${err.message ?? "unknown error"}`;
    },
  );

  return {
    valid: false,
    errors,
    document: null,
  };
}
