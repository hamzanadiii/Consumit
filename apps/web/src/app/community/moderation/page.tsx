import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/identity-server'
import { ModerationQueue } from '../../taste/social'
import { FilScreenShell } from '../../shared'
export default async function ModerationPage() { const session = await getServerSession(); if (session.status !== 'authenticated' || session.member.role !== 'admin') notFound(); return <FilScreenShell><main id="consumit-main-content" tabIndex={-1} className="taste taste-page"><ModerationQueue /></main></FilScreenShell> }
