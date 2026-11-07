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
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
            if (!userData.user) return null;

            const profile = await check(supabase
                .from('profiles')
                .select('id, display_name, role, active, invitation_accepted, permissions')
                .eq('id', userData.user.id)
                .maybeSingle());
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

        async loadAttempts() {
            const supabase = this.requireClient();
            return await check(supabase
                .from('assessment_attempts')
                .select('id, student_name, grade, percent, diagnostic_percent, progress, weak_skills, process_steps, created_at')
                .order('created_at', { ascending: false })
                .limit(5000));
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
                .select('id, email, display_name, role, active, invitation_accepted, permissions')
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
            return await check(supabase.functions.invoke('create-teacher', { body: invitation }));
        }
    });
})();
