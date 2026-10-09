'use client'
import { createMemberActionPanel } from '@consumit/web-core/client/member-action-panel'
import { LogDialog } from './log-dialog'
import { RatingWidget } from './rating-widget'
export const MemberActionPanel = createMemberActionPanel({ LogDialog, RatingWidget })
