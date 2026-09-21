import type { Config } from "tailwindcss";

// Crow house palette — matches the Industrial Comp Database exactly:
// navy #1B2A4A, gold accent #A78C52, EB Garamond display serif.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1B2A4A",
        accent: "#A78C52",
        ink: "#20242C",
        paper: "#F5F3EE",
      },
      fontFamily: {
        display: ['"EB Garamond"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
