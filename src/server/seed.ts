import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  assistanceReasons,
  fundAccounts,
  memberRoles,
  members,
  roles,
  siteSettings,
  userAccounts,
  type LandingHighlight,
  type LandingSlidePhoto,
} from '../db/schema.ts';
import { recordAudit } from './audit.ts';
import { hashPassword } from './crypto.ts';

let seeded = false;
let seedingPromise: Promise<void> | null = null;

export const INITIAL_OWNER_EMAIL = (
  process.env.SEED_ADMIN_EMAIL || 'tmkuaewelfarecommunityadmin@gmail.com'
)
  .trim()
  .toLowerCase();
export const DEFAULT_ADMIN_USERNAME = (process.env.SEED_ADMIN_USERNAME || 'admin')
  .trim()
  .toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin@54321';

export const DEFAULT_SITE_SETTINGS: {
  id: string;
  appTitleEn: string;
  appTitleTa: string;
  logoDataUrl: string | null;
  heroBadgeEn: string;
  heroBadgeTa: string;
  heroSubtitleEn: string;
  heroSubtitleTa: string;
  highlights: LandingHighlight[];
  sliderPhotos: LandingSlidePhoto[];
} = {
  id: 'default',
  appTitleEn: 'Village Welfare Fund',
  appTitleTa: 'கிராம நல நிதி',
  logoDataUrl: null,
  heroBadgeEn: 'English & தமிழ் · INR & AED Ledgers',
  heroBadgeTa: 'தமிழ் & English · INR & AED கணக்குகள்',
  heroSubtitleEn:
    'Transparent community contributions, committee-reviewed welfare assistance, and dual-currency treasury governance.',
  heroSubtitleTa:
    'சமூக சந்தா, குழு ஒப்புதலுடன் கூடிய நலத்திட்ட உதவி மற்றும் இரு நாணய கருவூல மேலாண்மை.',
  highlights: [
    {
      id: 'h-1',
      titleEn: 'Verified Contributions',
      titleTa: 'சரிபார்க்கப்பட்ட சந்தா',
      bodyEn: 'Independent committee verification before ledger posting.',
      bodyTa: 'கணக்கில் சேர்க்கும் முன் குழு சரிபார்ப்பு.',
    },
    {
      id: 'h-2',
      titleEn: 'Committee Assistance',
      titleTa: 'குழு உதவி ஒப்புதல்',
      bodyEn: '50% normal threshold or 1-vote emergency review.',
      bodyTa: 'சாதாரண உதவிக்கு 50% மற்றும் அவசரத்திற்கு 1 ஒப்புதல்.',
    },
    {
      id: 'h-3',
      titleEn: 'UAE AED Settlements',
      titleTa: 'UAE AED தீர்வுகள்',
      bodyEn: 'Monthly AED-to-INR conversion without double-counting.',
      bodyTa: 'மாதாந்திர AED-INR மாற்று கணக்கு துல்லியமாக பதிவு.',
    },
    {
      id: 'h-4',
      titleEn: 'Immutable Audit Trail',
      titleTa: 'மாற்ற முடியாத தணிக்கை',
      bodyEn: 'Every approval, payout, and edit preserves actor role history.',
      bodyTa: 'ஒவ்வொரு செயலும் பொறுப்புப் பதிவுடன் சேமிக்கப்படும்.',
    },
  ],
  sliderPhotos: [
    {
      id: 'slide-1',
      imageDataUrl: '/slides/slide-community.jpg',
      captionEn: 'Village community review and transparent welfare governance',
      captionTa: 'கிராம சமூக ஒற்றுமை மற்றும் வெளிப்படையான நலத்திட்ட நிர்வாகம்',
    },
    {
      id: 'slide-2',
      imageDataUrl: '/slides/slide-education.jpg',
      captionEn: 'Supporting education, medical care, and family emergencies',
      captionTa: 'கல்வி, மருத்துவம் மற்றும் குடும்ப அவசரத் தேவைகளுக்கு உதவி',
    },
  ],
};

export const SYSTEM_ROLES = [
  { code: 'admin', displayNameEn: 'Administrator', displayNameTa: 'நிர்வாகி' },
  { code: 'committee_member', displayNameEn: 'Committee Member', displayNameTa: 'குழு உறுப்பினர்' },
  { code: 'treasurer', displayNameEn: 'Treasurer', displayNameTa: 'பொருளாளர்' },
  { code: 'member', displayNameEn: 'Member', displayNameTa: 'உறுப்பினர்' },
  { code: 'auditor', displayNameEn: 'Auditor', displayNameTa: 'தணிக்கையாளர்' },
] as const;

export const SYSTEM_ASSISTANCE_REASONS = [
  { nameEn: 'Medical Emergency', nameTa: 'மருத்துவ அவசரம்', status: 'active' },
  { nameEn: 'Education Support', nameTa: 'கல்வி உதவி', status: 'active' },
  { nameEn: 'Family Hardship', nameTa: 'குடும்ப நிதி உதவி', status: 'active' },
  { nameEn: 'Funeral & Bereavement Support', nameTa: 'இறுதிச் சடங்கு உதவி', status: 'active' },
  { nameEn: 'Wedding / Social Support', nameTa: 'திருமண / சமூக உதவி', status: 'active' },
  { nameEn: 'Other Welfare Need', nameTa: 'பிற நலத்திட்ட தேவை', status: 'active' },
] as const;

export const SYSTEM_ACCOUNTS = [
  {
    accountCode: '1010',
    accountName: 'India Bank Account (INR)',
    accountNameTa: 'இந்தியா வங்கி கணக்கு (INR)',
    accountType: 'asset',
    currencyCode: 'INR',
  },
  {
    accountCode: '1020',
    accountName: 'India Cash in Hand (INR)',
    accountNameTa: 'இந்தியா கை ரொக்கம் (INR)',
    accountType: 'asset',
    currencyCode: 'INR',
  },
  {
    accountCode: '1030',
    accountName: 'UAE Collection Account (AED)',
    accountNameTa: 'UAE வசூல் கணக்கு (AED)',
    accountType: 'asset',
    currencyCode: 'AED',
  },
  {
    accountCode: '4010',
    accountName: 'Contribution Income (INR)',
    accountNameTa: 'சந்தா வருவாய் (INR)',
    accountType: 'income',
    currencyCode: 'INR',
  },
  {
    accountCode: '4020',
    accountName: 'Contribution Income (AED)',
    accountNameTa: 'சந்தா வருவாய் (AED)',
    accountType: 'income',
    currencyCode: 'AED',
  },
  {
    accountCode: '4030',
    accountName: 'Other Inflows & Grants (INR)',
    accountNameTa: 'பிற வரவுகள் மற்றும் நன்கொடை (INR)',
    accountType: 'income',
    currencyCode: 'INR',
  },
  {
    accountCode: '5010',
    accountName: 'Welfare Assistance Expense (INR)',
    accountNameTa: 'நலத்திட்ட உதவி செலவு (INR)',
    accountType: 'expense',
    currencyCode: 'INR',
  },
  {
    accountCode: '5020',
    accountName: 'Welfare Assistance Expense (AED)',
    accountNameTa: 'நலத்திட்ட உதவி செலவு (AED)',
    accountType: 'expense',
    currencyCode: 'AED',
  },
  {
    accountCode: '5030',
    accountName: 'Bank & Remittance Charges (INR)',
    accountNameTa: 'வங்கி மற்றும் பரிமாற்ற கட்டணங்கள் (INR)',
    accountType: 'expense',
    currencyCode: 'INR',
  },
  {
    accountCode: '5040',
    accountName: 'Operational Expense (INR)',
    accountNameTa: 'நிர்வாக செலவுகள் (INR)',
    accountType: 'expense',
    currencyCode: 'INR',
  },
  {
    accountCode: '3010',
    accountName: 'AED FX Settlement Clearing',
    accountNameTa: 'AED நாணய மாற்று கணக்கு',
    accountType: 'clearing',
    currencyCode: 'AED',
  },
] as const;

export interface SeedOptions {
  forceAdminPasswordReset?: boolean;
}

async function ensureDefaultAdminUser(options: SeedOptions = {}): Promise<void> {
  const forcePasswordReset =
    options.forceAdminPasswordReset || process.env.SEED_ADMIN_FORCE_PASSWORD_RESET === 'true';

  await db.transaction(async (tx) => {
    const [existingAccount] = await tx
      .select()
      .from(userAccounts)
      .where(
        sql`LOWER(${userAccounts.username}) = ${DEFAULT_ADMIN_USERNAME} OR LOWER(${userAccounts.recoveryEmail}) = ${INITIAL_OWNER_EMAIL}`
      )
      .limit(1);

    let [adminMember] = existingAccount?.memberId
      ? await tx.select().from(members).where(eq(members.id, existingAccount.memberId)).limit(1)
      : await tx
          .select()
          .from(members)
          .where(
            sql`${members.memberNumber} = 'M-0001' OR LOWER(${members.email}) = ${INITIAL_OWNER_EMAIL}`
          )
          .limit(1);

    if (!adminMember) {
      const [insertedMember] = await tx
        .insert(members)
        .values({
          memberNumber: 'M-0001',
          fullNameEn: 'Village Fund Administrator',
          fullNameTa: 'கிராம நல நிதி நிர்வாகி',
          email: INITIAL_OWNER_EMAIL,
          contributionFrequency: 'monthly',
          expectedContributionAmount: '500.00',
          expectedContributionCurrency: 'INR',
          status: 'active',
        })
        .onConflictDoNothing({ target: members.memberNumber })
        .returning();

      adminMember =
        insertedMember ??
        (await tx.select().from(members).where(eq(members.memberNumber, 'M-0001')).limit(1))[0];
    } else if (!adminMember.email) {
      const [updatedMember] = await tx
        .update(members)
        .set({ email: INITIAL_OWNER_EMAIL, updatedAt: new Date() })
        .where(eq(members.id, adminMember.id))
        .returning();
      adminMember = updatedMember;
    }

    let adminAccount = existingAccount;
    const allRoles = await tx.select().from(roles);

    if (!adminAccount) {
      const [insertedAccount] = await tx
        .insert(userAccounts)
        .values({
          memberId: adminMember.id,
          username: DEFAULT_ADMIN_USERNAME,
          recoveryEmail: INITIAL_OWNER_EMAIL,
          passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
          status: 'active',
        })
        .onConflictDoNothing({ target: userAccounts.username })
        .returning();

      if (insertedAccount) {
        adminAccount = insertedAccount;
        await recordAudit(tx, {
          actorUserId: insertedAccount.id,
          actorMemberId: adminMember.id,
          actorUsername: insertedAccount.username,
          actorRoleCodes: allRoles.map((r) => r.code),
          entityType: 'user_account',
          entityId: insertedAccount.id,
          action: 'default_admin_seeded',
          newValues: {
            username: insertedAccount.username,
            recoveryEmail: INITIAL_OWNER_EMAIL,
            memberNumber: adminMember.memberNumber,
          },
        });
      } else {
        adminAccount = (
          await tx
            .select()
            .from(userAccounts)
            .where(sql`LOWER(${userAccounts.username}) = ${DEFAULT_ADMIN_USERNAME}`)
            .limit(1)
        )[0];
      }
    }

    if (adminAccount) {
      const patch: Partial<typeof userAccounts.$inferInsert> = {};
      if (!adminAccount.passwordHash || forcePasswordReset) {
        patch.passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
      }
      if (!adminAccount.recoveryEmail) {
        patch.recoveryEmail = INITIAL_OWNER_EMAIL;
      }
      if (!adminAccount.memberId) {
        patch.memberId = adminMember.id;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date();
        await tx.update(userAccounts).set(patch).where(eq(userAccounts.id, adminAccount.id));
      }
    }

    for (const r of allRoles) {
      await tx
        .insert(memberRoles)
        .values({
          memberId: adminMember.id,
          roleId: r.id,
          assignedBy: adminAccount?.id ?? null,
        })
        .onConflictDoNothing();
    }
  });
}

export async function ensureReferenceData(options: SeedOptions = {}): Promise<void> {
  if (seeded && !options.forceAdminPasswordReset) return;
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    try {
      for (const r of SYSTEM_ROLES) {
        await db.insert(roles).values(r).onConflictDoNothing({ target: roles.code });
      }
      for (const acc of SYSTEM_ACCOUNTS) {
        await db
          .insert(fundAccounts)
          .values({ ...acc, isActive: true })
          .onConflictDoNothing({ target: fundAccounts.accountCode });
      }
      for (const reason of SYSTEM_ASSISTANCE_REASONS) {
        await db
          .insert(assistanceReasons)
          .values(reason)
          .onConflictDoNothing({ target: assistanceReasons.nameEn });
      }
      await db
        .insert(siteSettings)
        .values(DEFAULT_SITE_SETTINGS)
        .onConflictDoNothing({ target: siteSettings.id });

      await ensureDefaultAdminUser(options);
      seeded = true;
    } catch (error) {
      console.error('Failed to seed reference data:', error);
      throw new Error('Failed to initialize reference data.', { cause: error });
    } finally {
      seedingPromise = null;
    }
  })();

  return seedingPromise;
}
