import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-gradient-primary text-white border border-primary/30 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15),0_2px_8px_hsl(0_0%_0%/0.4)] hover:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_4px_16px_hsl(0_0%_0%/0.5)] hover:brightness-110 active:shadow-[inset_0_2px_4px_hsl(0_0%_0%/0.3)] active:brightness-95",
        destructive: "bg-destructive text-destructive-foreground border border-destructive/30 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.1),0_2px_8px_hsl(0_0%_0%/0.4)] hover:brightness-110",
        outline: "border border-border bg-card/50 text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)] hover:bg-muted hover:border-primary/40 hover:text-primary",
        secondary: "bg-gradient-secondary text-secondary-foreground border border-secondary/30 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15),0_2px_8px_hsl(0_0%_0%/0.4)] hover:brightness-110",
        ghost: "hover:bg-muted/50 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        neon: "bg-gradient-neon text-white border border-primary/40 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_4px_16px_hsl(320_70%_55%/0.3)] hover:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.25),0_6px_24px_hsl(320_70%_55%/0.4)] hover:brightness-110",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-md px-4",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
