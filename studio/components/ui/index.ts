// Dealer Studio's kit. See every piece, in every state, at /studio/ui/ (app/ui/page.tsx).
//
// How to use it
// - A view is a page under app/ that returns <Page title="…" status={…} actions={…}> from "@/components/shell". The area
//   under the header scrolls and has the page padding; <Page full> gives the whole rest of the window instead (no padding,
//   no scroll): put the scene or the node map in it with "h-full" or "absolute inset-0".
// - Data: const {bank, graph, status, error, reload} = useBank() from "@/lib/bank" (one provider in the shell, read every
//   4 s while the tab is visible, same objects while nothing changed). After a write call await reload().
//   Reads and the one write are in "@/lib/api" (getProofs, getPlacements, getContract, getRooms, putDecision; ApiError).
// - Names: "@/lib/names" (nodeName, edgeName, takeName, parseJakob, formatJakob, takeFacts); verdicts: "@/lib/verdict".
// - Takes: "@/components/takes": TakeCard, TakeThumb, VerdictChip/TakeChip/ProofChip, DecisionBar (the only thing that
//   writes a decision; nothing is written without Jakob's click).
// - Side panel: <Sheet open onOpenChange title subtitle width={460}> slides over the right edge and leaves the page usable
//   (modal for a dimmed one). Centred question: <Dialog>. Short notes: const toast = useToast(); toast({tone, title}).
// - Look: tokens in app/globals.css (bg-canvas/surface/raised/overlay, border-line, text-ink/dim/faint, brass, the verdict
//   colours, text-2xs…2xl, rounded-sm/md/lg/xl). Brass is the one accent: the main action, the active view, focus, Primär.
//   Media first and large; chrome quiet. All text Swedish and short. cn() merges classes; className overrides defaults.
// - Links: next/link with absolute app paths ("/karta/"), never a relative or "#…" href (the page has <base href="/">);
//   a link that looks like a button: className={buttonClasses({variant, size})}. The old lab: a plain <a href="/lab.html">.
export { cn } from "./cn";
export { Button, buttonClasses, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { IconButton } from "./IconButton";
export { SegmentedControl, type Segment } from "./SegmentedControl";
export { Switch } from "./Switch";
export { Slider } from "./Slider";
export { Select, type SelectOption } from "./Select";
export { TextField, TextArea } from "./TextField";
export { Tabs, type TabItem } from "./Tabs";
export { Tooltip, TooltipProvider } from "./Tooltip";
export { Dialog, Sheet } from "./Dialog";
export { Card, Panel } from "./Card";
export { Badge, Kbd, type BadgeTone } from "./Badge";
export { Skeleton, EmptyState, ErrorState } from "./States";
export { Spinner } from "./Spinner";
export { ScrollArea } from "./ScrollArea";
export { ToastProvider, useToast, type ToastInput, type ToastTone } from "./Toast";
