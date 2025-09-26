export default function TOCItem({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left py-2 hover:bg-gray-100"
    >
      {label}
    </button>
  );
}
