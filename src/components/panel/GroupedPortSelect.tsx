import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { groupPortsByCountry } from "@/lib/ferry/filtering";
import type { Port } from "@/lib/ferry/types";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ports: Port[];
  placeholder?: string;
}

export function GroupedPortSelect({
  label,
  value,
  onChange,
  ports,
  placeholder = "Choisir un port",
}: Props) {
  const groups = useMemo(() => groupPortsByCountry(ports), [ports]);

  return (
    <label className="grid min-w-0 gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      {/* La clé force la remise à zéro visuelle quand la valeur est effacée. */}
      <Select key={value ? "set" : "empty"} {...(value ? { value } : {})} onValueChange={onChange}>
        <SelectTrigger className="batogo-control h-11 text-sm text-foreground" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectGroup key={group.code}>
              <SelectLabel>{group.name}</SelectLabel>
              {group.ports.map((port) => (
                <SelectItem key={port.id} value={port.id}>
                  {port.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
