import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn("flex gap-1 overflow-x-auto border-b border-rule -mx-4 px-4 sm:mx-0 sm:px-0", className)} {...props} />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 font-sans text-[14px] font-medium text-ink-muted transition-colors hover:text-ink data-[state=active]:border-sera data-[state=active]:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("pt-5 focus-visible:outline-none", className)} {...props} />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
