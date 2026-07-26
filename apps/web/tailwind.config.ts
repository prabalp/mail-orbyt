import type { Config } from "tailwindcss";
import { designSystemPreset } from "@mail-orbyt/design-system/tailwind-preset";

export default {
  presets: [designSystemPreset as Config],
  content: ["./src/**/*.{ts,tsx}", "../../packages/design-system/src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
