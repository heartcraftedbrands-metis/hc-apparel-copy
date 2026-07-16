import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function CompactMarginBadge({ margin }) {
  if (margin === null || margin === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  let label = '';
  let fullMessage = '';
  let bgColor = '';
  let textColor = '';

  if (margin >= 30) {
    label = 'Healthy';
    fullMessage = 'Healthy Margin — Good profit potential';
    bgColor = 'bg-green-100';
    textColor = 'text-green-700';
  } else if (margin >= 15) {
    label = 'Moderate';
    fullMessage = 'Moderate Margin — Monitor pricing';
    bgColor = 'bg-amber-100';
    textColor = 'text-amber-700';
  } else {
    label = 'Low';
    fullMessage = 'Low Margin — Review Pricing';
    bgColor = 'bg-red-100';
    textColor = 'text-red-700';
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`text-xs whitespace-nowrap ${bgColor} ${textColor}`}>
            {label} ({margin.toFixed(0)}%)
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{fullMessage}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}