// src/components/ui/SectionHeader.tsx
type Props = {
  label: string;
  id?: string;
  className?: string;
};

export default function SectionHeader({ label, id, className = "" }: Props) {
  return (
    <div id={id} className={`text-xs font-medium text-gray-600 ${className}`.trim()}>
      {label}
    </div>
  );
}
