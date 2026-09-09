import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'This integration is retired. Use Pocket for capture and ClickUp for team tasks.' }, { status: 410 })
}

export const POST = GET
