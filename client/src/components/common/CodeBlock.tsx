interface CodeBlockProps {
  code: string;
}

export function CodeBlock({ code }: CodeBlockProps): JSX.Element {
  const lines = code.split(/\r?\n/);

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-slate-950/80 px-3 py-2 font-mono text-[13px] leading-6">
      {lines.map((line, index) => (
        <div key={index} className="flex gap-3">
          <span className="w-7 text-right text-slate-500">{index + 1}</span>
          <span className="text-slate-200">{line || ' '}</span>
        </div>
      ))}
    </div>
  );
}
