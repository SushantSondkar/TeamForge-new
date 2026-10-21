-- ============================================================================
-- TeamForge Supabase (PostgreSQL) Initial Schema Migration
-- Phase 1: Core Relational Tables, Foreign Keys & Row-Level Security (RLS)
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Profiles (matches Supabase Auth auth.users via foreign key)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100) DEFAULT 'Candidate',
    department VARCHAR(100),
    year VARCHAR(20),
    bio TEXT,
    github VARCHAR(255),
    linkedin VARCHAR(255),
    portfolio VARCHAR(255),
    availability NUMERIC(3, 2) DEFAULT 1.0 CHECK (availability >= 0 AND availability <= 1),
    credibility NUMERIC(3, 2) DEFAULT 0.5 CHECK (credibility >= 0 AND credibility <= 1),
    teammate_rating NUMERIC(3, 2) DEFAULT 0.5 CHECK (teammate_rating >= 0 AND teammate_rating <= 1),
    competition_wins INTEGER DEFAULT 0 CHECK (competition_wins >= 0),
    review_count INTEGER DEFAULT 0 CHECK (review_count >= 0),
    is_profile_hidden BOOLEAN DEFAULT FALSE,
    completeness_percentage INTEGER DEFAULT 20 CHECK (completeness_percentage >= 0 AND completeness_percentage <= 100),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (is_profile_hidden = FALSE OR auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile on signup"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 2. User Skills
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    level INTEGER NOT NULL CHECK (level >= 1 AND level <= 5),
    verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view skills of visible profiles"
    ON public.user_skills FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = user_skills.user_id 
              AND (profiles.is_profile_hidden = FALSE OR profiles.id = auth.uid())
        )
    );

CREATE POLICY "Users can manage own skills"
    ON public.user_skills FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. User Credentials (external credential verifications: GitHub, LinkedIn)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'github', 'linkedin'
    provider_user_id VARCHAR(255),
    badge_label VARCHAR(100),       -- 'Verified', 'Linked'
    verified_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Visible credentials are viewable by authenticated users"
    ON public.user_credentials FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Users manage own credentials"
    ON public.user_credentials FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. Events (hackathons / campus competitions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    event_date TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are viewable by all authenticated users"
    ON public.events FOR SELECT
    TO authenticated
    USING (TRUE);

-- ----------------------------------------------------------------------------
-- 5. Team Requests (Projects / Requirements)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_name VARCHAR(255) NOT NULL,
    theme VARCHAR(100) NOT NULL,
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    event_name VARCHAR(255),
    project_requirement TEXT NOT NULL,
    deliverables TEXT NOT NULL,
    team_size INTEGER NOT NULL CHECK (team_size >= 1),
    deadline TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team requests are viewable by authenticated users"
    ON public.team_requests FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Owners can create and update team requests"
    ON public.team_requests FOR ALL
    TO authenticated
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- ----------------------------------------------------------------------------
-- 6. Team Roles (Roles needed in a team requirement)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_request_id UUID NOT NULL REFERENCES public.team_requests(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    required_skills TEXT[] DEFAULT '{}',
    preferred_skills TEXT[] DEFAULT '{}',
    proficiency VARCHAR(50) DEFAULT 'Intermediate',
    openings INTEGER DEFAULT 1 CHECK (openings >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team roles are viewable by authenticated users"
    ON public.team_roles FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Team owners can manage team roles"
    ON public.team_roles FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.team_requests 
            WHERE team_requests.id = team_roles.team_request_id 
              AND team_requests.created_by = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- 7. Team Request Actions (Shared Table for Invites & Applications)
-- Flow: PENDING -> ACCEPTED -> CONFIRMED -> LOCKED (also DECLINED, EXPIRED)
-- Direction: 'INVITE' (Team lead invited candidate) | 'APPLY' (Candidate applied to team)
-- ----------------------------------------------------------------------------
CREATE TYPE action_direction AS ENUM ('INVITE', 'APPLY');
CREATE TYPE action_status AS ENUM ('PENDING', 'ACCEPTED', 'CONFIRMED', 'LOCKED', 'DECLINED', 'EXPIRED');

CREATE TABLE IF NOT EXISTS public.team_request_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_request_id UUID NOT NULL REFERENCES public.team_requests(id) ON DELETE CASCADE,
    role_id UUID REFERENCES public.team_roles(id) ON DELETE SET NULL,
    role_title VARCHAR(255) NOT NULL,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    direction action_direction NOT NULL,
    status action_status DEFAULT 'PENDING',
    confirmed_by_requester BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_request_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties involved can view actions"
    ON public.team_request_actions FOR SELECT
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Sender can create action"
    ON public.team_request_actions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Participants can update action according to state machine"
    ON public.team_request_actions FOR UPDATE
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ----------------------------------------------------------------------------
-- 8. Locked Events (Per-Event Availability Lock)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locked_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_name VARCHAR(255) NOT NULL,
    team_request_id UUID REFERENCES public.team_requests(id) ON DELETE CASCADE,
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, event_name)
);

ALTER TABLE public.locked_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users and teammates can view event locks"
    ON public.locked_events FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Only confirmed match can insert locked event"
    ON public.locked_events FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 9. Contact Sharing Consent (Contact info released only upon mutual confirmation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_sharing_consent (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    granter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_request_id UUID NOT NULL REFERENCES public.team_requests(id) ON DELETE CASCADE,
    consented_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(granter_id, recipient_id, team_request_id)
);

ALTER TABLE public.contact_sharing_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contacts they consented with"
    ON public.contact_sharing_consent FOR SELECT
    TO authenticated
    USING (auth.uid() = granter_id OR auth.uid() = recipient_id);

-- ----------------------------------------------------------------------------
-- 10. Team Reputation (Peer reviews after an event)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_reputation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_request_id UUID REFERENCES public.team_requests(id) ON DELETE SET NULL,
    event_name VARCHAR(255),
    rating NUMERIC(2, 1) CHECK (rating >= 1.0 AND rating <= 5.0),
    review_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reputations are viewable by authenticated users"
    ON public.team_reputation FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Reviewer creates peer feedback"
    ON public.team_reputation FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = reviewer_id);

-- ----------------------------------------------------------------------------
-- 11. Shortlists (Coordinator / Team Lead candidate shortlists)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shortlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_request_id UUID NOT NULL REFERENCES public.team_requests(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_request_id, candidate_id)
);

ALTER TABLE public.shortlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shortlists are managed only by team creator"
    ON public.shortlists FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.team_requests 
            WHERE team_requests.id = shortlists.team_request_id 
              AND team_requests.created_by = auth.uid()
        )
    );
