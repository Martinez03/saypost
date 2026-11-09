import * as React from "react"
import { cn } from "cn"
import { textareaClass } from "./field"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(textareaClass, "min-h-24 text-base md:text-sm", className)} {...props} />
}

export { Textarea }
