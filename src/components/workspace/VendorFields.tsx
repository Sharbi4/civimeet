import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { VendorDetails } from "@/lib/vendors";

export function VendorFields({
  value,
  onChange,
  prefix,
}: {
  value: VendorDetails;
  onChange: (value: VendorDetails) => void;
  prefix: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(
        [
          ["name", "Vendor name", 200],
          ["category", "Category / services", 100],
          ["contact_name", "Business contact name", 160],
          ["email", "Business email", 254],
          ["phone", "Business phone", 60],
        ] as const
      ).map(([field, label, max]) => (
        <div key={field} className="space-y-2">
          <Label htmlFor={`${prefix}-${field}`}>{label}</Label>
          <Input
            id={`${prefix}-${field}`}
            value={value[field]}
            maxLength={max}
            required={field === "name"}
            minLength={field === "name" ? 2 : undefined}
            type={field === "email" ? "email" : "text"}
            onChange={(e) => onChange({ ...value, [field]: e.target.value })}
          />
        </div>
      ))}
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-areas`}>Service areas (one per line)</Label>
        <Textarea
          id={`${prefix}-areas`}
          value={value.service_areas.join("\n")}
          onChange={(e) => onChange({ ...value, service_areas: e.target.value.split("\n") })}
          placeholder="Tucson, AZ&#10;Oro Valley, AZ"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}-notes`}>Event suitability / notes</Label>
        <Textarea
          id={`${prefix}-notes`}
          value={value.notes}
          maxLength={4000}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>
    </div>
  );
}
