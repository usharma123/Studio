import { createContext } from "react";

export const NumberFieldContext = createContext<{ fieldId: string } | null>(null);
