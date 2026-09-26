import { Box, TextField } from "@mui/material";
import { useRef } from "react";

import { VERIFICATION_CODE_LENGTH } from "@/client/src/lib/verificationCode.ts";


interface VerificationCodeInputProps {
  digits: string[];
  onChange: (digits: string[]) => void;
}

/**
 * One box per digit of an emailed code. Typing advances focus, Backspace on an
 * empty box moves back, and pasting a whole code fills the following boxes.
 */
export function VerificationCodeInput({ digits, onChange }: VerificationCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lastIndex = VERIFICATION_CODE_LENGTH - 1;

  const handleChange = (index: number, value: string) => {
    const next = digits.slice();
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, "").slice(0, VERIFICATION_CODE_LENGTH);
      if (pasted.length > 0) {
        for (let i = 0; i < pasted.length && i + index < VERIFICATION_CODE_LENGTH; i++) {
          next[i + index] = pasted[i];
        }
        onChange(next);
        inputRefs.current[Math.min(index + pasted.length, lastIndex)]?.focus();
        return;
      }
    }

    const digit = value.replace(/\D/g, "").slice(-1);
    next[index] = digit;
    onChange(next);
    if (digit && index < lastIndex) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <Box sx={{ display: "flex", gap: 1, justifyContent: "center", mb: 3 }}>
      {digits.map((digit, index) => (
        <TextField
          key={index}
          inputRef={(el) => { inputRefs.current[index] = el; }}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          sx={{ width: { xs: 36, sm: 44 } }}
          slotProps={{
            htmlInput: {
              maxLength: VERIFICATION_CODE_LENGTH,
              "aria-label": `Digit ${index + 1}`,
              style: {
                textAlign: "center",
                fontSize: "1.5rem",
                fontWeight: "bold",
                padding: "12px 0",
              },
              inputMode: "numeric",
            },
          }}
        />
      ))}
    </Box>
  );
}
