import { useMemo } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Port } from "@/lib/ferry/types";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ports: Port[];
}

export function GroupedPortSelect({ label, value, onChange, ports }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, Port[]>();
    ports.forEach((port) => {
      const list = map.get(port.country_name) ?? [];
      list.push(port);
      map.set(port.country_name, list);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "fr"))
      .map(([country, list]) => [country, list.sort((a, b) => a.name.localeCompare(b.name, "fr"))] as const);
  }, [ports]);

  return (
    <label className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
      {label}
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-10 bg-background text-sm text-foreground">
          <SelectValue placeholder="Choisir un port" />
        </SelectTrigger>
        <SelectContent>
          {groups.map(([country, list]) => (
            <SelectGroup key={country}>
              <SelectLabel>{country}</SelectLabel>
              {list.map((port) => (
                <SelectItem key={port.id} value={port.id}>{port.name}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
