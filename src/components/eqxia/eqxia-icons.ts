/**
 * Eqxia Icon Registry — bloc partagé entre toutes les apps Eqxia.
 * Réexporte les icônes Lucide React organisées par concept métier.
 * Usage :  import { IconRevenu, IconClient } from '@/components/eqxia/eqxia-icons'
 */
export {
  // ── Finance & revenus ──────────────────────────────────────────────────────
  TrendingUp       as IconRevenu,
  TrendingDown     as IconPerte,
  DollarSign       as IconMontant,
  Percent          as IconMarge,
  Wallet           as IconCharges,
  Receipt          as IconDepense,
  PiggyBank        as IconEpargne,
  ArrowUpRight     as IconHausse,
  ArrowDownRight   as IconBaisse,
  BadgeDollarSign  as IconCA,
  Banknote         as IconSalaire,
  CreditCard       as IconAbonnement,

  // ── Projets ────────────────────────────────────────────────────────────────
  Briefcase        as IconProjet,
  FolderOpen       as IconDossier,
  Target           as IconObjectif,
  Milestone        as IconPhase,
  CheckCircle2     as IconOK,
  XCircle          as IconKO,
  AlertTriangle    as IconWarning,
  AlertOctagon     as IconCritical,
  ShieldCheck      as IconSecurite,
  Zap              as IconActif,
  Clock            as IconDelai,
  CalendarDays     as IconCalendrier,
  CalendarX        as IconDateManquante,
  Timer            as IconDuree,

  // ── Clients & relations ────────────────────────────────────────────────────
  Building2        as IconClient,
  Users            as IconEquipe,
  UserCheck        as IconEmploye,
  UserX            as IconSorti,
  UserPlus         as IconNouveau,
  Globe            as IconInternational,
  Handshake        as IconPartenaire,
  Award            as IconSatisfaction,

  // ── Dashboard & analyse ────────────────────────────────────────────────────
  BarChart3        as IconDashboard,
  LineChart        as IconCourbe,
  BarChart2        as IconHistogramme,
  PieChart         as IconCamembert,
  Activity         as IconActivite,
  Telescope        as IconPrevisionnel,
  Sparkles         as IconIA,
  Database         as IconBase,

  // ── Interface & navigation ─────────────────────────────────────────────────
  Settings         as IconReglages,
  RefreshCw        as IconSync,
  Search           as IconRecherche,
  Filter           as IconFiltre,
  Download         as IconExport,
  Upload           as IconImport,
  ExternalLink     as IconLien,
  Copy             as IconCopier,
  Trash2           as IconSupprimer,
  Pencil           as IconModifier,
  Plus             as IconAjouter,
  Minus            as IconRetirer,
  Eye              as IconVoir,
  EyeOff           as IconMasquer,
  ChevronDown      as IconChevronBas,
  ChevronRight     as IconChevronDroit,
  ArrowLeft        as IconRetour,
  LayoutDashboard  as IconLayout,
  Maximize2        as IconPleinEcran,
  Minimize2        as IconReducer,
  Info             as IconInfo,
  HelpCircle       as IconAide,
  Bell             as IconNotification,
  Lock             as IconVerrou,
  Unlock           as IconDeVerrou,

  // ── Thème ─────────────────────────────────────────────────────────────────
  Sun              as IconThemeLight,
  Moon             as IconThemeDark,
  Monitor          as IconThemeAuto,

  // ── Divers Eqxia ──────────────────────────────────────────────────────────
  Rocket           as IconLancement,
  Star             as IconFavori,
  Tag              as IconTag,
  MapPin           as IconPays,
  Flag             as IconStatut,
  MessageSquare    as IconCommentaire,
  FileText         as IconDocument,
  Layers           as IconCouches,
} from 'lucide-react'
