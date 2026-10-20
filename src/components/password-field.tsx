"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return <div className="relative"><input {...props} type={shown ? "text" : "password"} className={`${props.className ?? "field"} pr-12`} /><button type="button" onClick={() => setShown((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink/50" aria-label={shown ? "Hide password" : "Show password"}>{shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>;
}
