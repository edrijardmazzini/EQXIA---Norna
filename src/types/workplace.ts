export interface WorkplaceEmployee {
  id: string
  name: string
  email: string
  role: string
  department: string
  pays: string
  specializations: string[]
  availability: string
  leaveQuotaAnnual: number
  leaveMedQuota: number
  leaveConsoCurrentY: number
  leaveMedConsoCurrentY: number
}

export interface WorkplaceProject {
  id: string
  name: string
  type: string
  status: string
  phase: string
  clientName: string
  startDate: string
  endDate: string
  deadline: string
  ownerName: string
  ownerIds: string[]
  health: string
  allocated: boolean    // Formula 'Alloué' depuis Notion (length(Allocations) > 0)
}

export type AllocationType = 'Project' | 'Leave' | 'Public Holiday'
export type AllocationStatus = 'Confirmed' | 'Probable' | 'Draft'
export type LeaveType = 'Annual' | 'Sick' | 'Special' | 'Unpaid'
export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
export type HalfDay = 'Morning' | 'Afternoon'

export interface Allocation {
  id: string
  name: string
  personIds: string[]
  projectIds: string[]
  projectName: string
  projectType: string
  type: AllocationType
  startDate: string
  startHalf: HalfDay
  endDate: string
  endHalf: HalfDay
  effortPct: number
  status: AllocationStatus
  leaveType: LeaveType | ''
  approvalStatus: ApprovalStatus | ''
  approverIds: string[]
  notes: string
}

export interface TimeEntry {
  id: string
  description: string
  personIds: string[]
  projectIds: string[]
  date: string         // YYYY-MM-DD (start of Period)
  endDate: string      // YYYY-MM-DD (end of Period if range, else same as date)
  hours: number
  workType: string     // ex: 'Workshop delivery', 'Consulting', 'Training Prep', etc.
  notes: string
}

export interface WorkplaceDashboard {
  employees: WorkplaceEmployee[]
  projects: WorkplaceProject[]
  allocations: Allocation[]
  timeEntries: TimeEntry[]
}
