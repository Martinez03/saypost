import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { requireBusiness } from "@/lib/session";
import { PostsList } from "./posts-list";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.posts.title };
}

export default async function PostsPage() {
  const business = await requireBusiness();
  return <PostsList timeZone={business.timezone} />;
}
