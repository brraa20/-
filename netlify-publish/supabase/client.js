(function () {
    const config = window.TalalaSupabaseConfig || {};
    const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || '');
    const validKey = typeof config.publishableKey === 'string'
        && (config.publishableKey.startsWith('sb_publishable_') || config.publishableKey.startsWith('eyJ'));
    const client = validUrl && validKey && window.supabase
        ? window.supabase.createClient(config.url, config.publishableKey)
        : null;

    async function check(result) {
        if (result.error) throw result.error;
        return result.data;
    }

    window.TalalaBackend = Object.freeze({
        isConfigured: Boolean(client),
        configurationMessage: 'لم يُربط المشروع بقاعدة البيانات بعد. أضف Project URL والمفتاح العام في supabase/config.js.',

        requireClient() {
            if (!client) throw new Error(this.configurationMessage);
            return client;
        },

        async getProfile() {
            const supabase = this.requireClient();
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!sessionData.session) return null;

            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
            if (!userData.user) return null;
            if (userData.user.id !== sessionData.session.user.id) {
                throw new Error('The authenticated user changed while loading the profile.');
            }

            if (userData.user.email?.trim().toLowerCase() === 'brraa.20@gmail.com') {
                await check(supabase.rpc('ensure_platform_owner_profile'));
            }

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('id, email, display_name, role, active, invitation_accepted, permissions, school_name, assigned_grades, assigned_subjects')
                .eq('id', userData.user.id)
                .maybeSingle();
            if (profileError) throw profileError;
            if (profile && profile.id !== userData.user.id) {
                throw new Error('The loaded profile does not match the authenticated user.');
            }
            return profile ? { ...profile, email: userData.user.email } : null;
        },

        async loadContent(contentKey) {
            const supabase = this.requireClient();
            const row = await check(supabase
                .from('app_content')
                .select('content')
                .eq('content_key', contentKey)
                .maybeSingle());
            return row?.content ?? null;
        },

        async saveContent(contentKey, content) {
            const supabase = this.requireClient();
            await check(supabase.from('app_content').upsert({
                content_key: contentKey,
                content,
                updated_by: (await this.getProfile()).id,
                updated_at: new Date().toISOString()
            }, { onConflict: 'content_key' }));
        },

        async saveAttempt(attempt) {
            const supabase = this.requireClient();
            await check(supabase.from('assessment_attempts').insert(attempt));
        },

        async saveProgress(progress) {
            const supabase = this.requireClient();
            await check(supabase.rpc('save_student_assessment_progress', {
                p_session_id: progress.session_id,
                p_student_name: progress.student_name,
                p_grade: progress.grade,
                p_stage: progress.stage,
                p_stage_label: progress.stage_label,
                p_progress_percent: progress.progress_percent,
                p_current_question: progress.current_question,
                p_total_questions: progress.total_questions,
                p_trained_seconds: progress.trained_seconds,
                p_process_steps: progress.process_steps,
                p_started_at: progress.started_at,
                p_completed: progress.completed
            }));
        },

        async loadAttempts() {
            const supabase = this.requireClient();
            return await check(supabase
                .from('assessment_attempts')
                .select('id, student_name, grade, percent, diagnostic_percent, progress, weak_skills, process_steps, duration_seconds, created_at')
                .order('created_at', { ascending: false })
                .limit(5000));
        },

        async loadStudentProgress() {
            const supabase = this.requireClient();
            const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            return await check(supabase
                .from('student_assessment_progress')
                .select('session_id, student_name, grade, stage, stage_label, progress_percent, current_question, total_questions, trained_seconds, process_steps, started_at, updated_at')
                .gte('updated_at', recentCutoff)
                .order('updated_at', { ascending: false }));
        },

        async loadAnalyticsSummary() {
            const supabase = this.requireClient();
            return await check(supabase.rpc('get_teacher_analytics_summary'));
        },

        async deleteStudentAttempts(studentName, grade) {
            const supabase = this.requireClient();
            await check(supabase.from('assessment_attempts')
                .delete()
                .eq('student_name', studentName)
                .eq('grade', grade));
        },

        async loadTeachers() {
            const supabase = this.requireClient();
            return await check(supabase
                .from('profiles')
                .select('id, email, display_name, role, active, invitation_accepted, permissions, school_name, assigned_grades, assigned_subjects')
                .order('created_at', { ascending: true }));
        },

        async createTicket(ticket) {
            const supabase = this.requireClient();
            return await check(supabase.rpc('submit_support_ticket', {
                p_request_type: ticket.type,
                p_full_name: ticket.fullName,
                p_subject: ticket.subject,
                p_details: ticket.details
            }));
        },

        async trackTicket(ticketCode) {
            const supabase = this.requireClient();
            return await check(supabase.rpc('track_support_ticket', { p_ticket_code: ticketCode }));
        },

        async loadTickets() {
            const supabase = this.requireClient();
            return await check(supabase
                .from('support_tickets')
                .select('ticket_code, request_type, full_name, subject, details, status, reply, created_at')
                .order('created_at', { ascending: false }));
        },

        async updateTicket(ticketCode, status, reply) {
            const supabase = this.requireClient();
            await check(supabase.from('support_tickets')
                .update({ status, reply, updated_at: new Date().toISOString() })
                .eq('ticket_code', ticketCode));
        },

        async deleteTicket(ticketCode) {
            const supabase = this.requireClient();
            await check(supabase.from('support_tickets').delete().eq('ticket_code', ticketCode));
        },

        async updateDisplayName(displayName) {
            const supabase = this.requireClient();
            await check(supabase.rpc('update_my_display_name', { p_display_name: displayName }));
        },

        async inviteTeacher(invitation) {
            const supabase = this.requireClient();
            const { data, error } = await supabase.functions.invoke('create-teacher', { body: invitation });
            if (!error) return data;

            let message = error.message;
            if (error.context instanceof Response) {
                const responseText = await error.context.clone().text();
                if (responseText) {
                    try {
                        const responseBody = JSON.parse(responseText);
                        if (typeof responseBody.error === 'string') message = responseBody.error;
                    } catch {
                        message = `${message}: ${responseText.slice(0, 240)}`;
                    }
                }
            }
            throw new Error(message);
        }
    });
})();
