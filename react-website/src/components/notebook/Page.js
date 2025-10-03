export default function Page({ title, children }) {
  return (
    <div className="p-6 w-full h-full flex flex-col">
      {title && <h1 className="text-xl font-bold mb-4">{title}</h1>}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
