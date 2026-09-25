import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-neutral-600">That page doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary mt-6">
        Back to search
      </Link>
    </div>
  );
}
