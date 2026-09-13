export interface Workspace { id: string; name: string; description?: string; engine?: string; status: 'active' | 'archived'; updated_at: string }
export interface Character { id: string; name: string; display_name?: string; metadata?: Record<string, unknown> }
export interface Attack { attack_id: string; name: string; character_id?: string | null; startup_frames: number; active_frames: number; recovery_frames: number; damage: number; tags?: string[]; cancel_window?: { start_frame: number; end_frame: number } }
export interface Combo { id: string; name: string; character_id: string; source: string; steps: { index: number; attack_id: string; condition?: string }[]; notes?: string }
export interface Analysis { id: string; subject: string; findings: { title: string; description: string; severity: string }[]; recommendations: { title: string; description: string; suggested_action: string }[] }
export interface Overview { workspace: Workspace; has_data: boolean; kpis: Record<string, number | null>; recent_activity: { id: string; label: string; timestamp: string }[]; recent_recommendations: { id: string; title: string; description: string; suggested_action: string }[] }
