-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_time TIMESTAMPTZ NOT NULL,
    is_special BOOLEAN DEFAULT FALSE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern JSONB, -- Store recurrence rules as JSON
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create reminders table to track sent reminders
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL, -- 'daily', 'hourly', 'special_day_before', 'special_day_of'
    scheduled_time TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_scheduled_time ON tasks(scheduled_time);
CREATE INDEX idx_tasks_is_active ON tasks(is_active);
CREATE INDEX idx_tasks_is_recurring ON tasks(is_recurring);
CREATE INDEX idx_reminders_scheduled_time ON reminders(scheduled_time);
CREATE INDEX idx_reminders_sent_at ON reminders(sent_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up old completed tasks
CREATE OR REPLACE FUNCTION cleanup_old_tasks()
RETURNS void AS $$
BEGIN
    -- Delete non-recurring tasks that are more than 1 day old
    DELETE FROM tasks 
    WHERE is_recurring = FALSE 
    AND scheduled_time < NOW() - INTERVAL '1 day'
    AND is_active = TRUE;
    
    -- Delete old sent reminders (keep for 30 days)
    DELETE FROM reminders 
    WHERE sent_at IS NOT NULL 
    AND sent_at < NOW() - INTERVAL '30 days';
END;
$$ language 'plpgsql';

--- Create recurring task instances view (fixed)
CREATE OR REPLACE VIEW recurring_task_instances AS
SELECT 
    t.id,
    t.user_id,
    t.title,
    t.description,
    t.is_special,
    t.notes,
    t.created_at,
    t.updated_at,
    gs.instance_time
FROM tasks t
JOIN LATERAL generate_series(
    t.scheduled_time,
    NOW() + INTERVAL '3 months',
    INTERVAL '1 week'
) gs(instance_time) ON t.recurrence_pattern->>'type' = 'weekly'
WHERE t.is_recurring = TRUE AND t.is_active = TRUE

UNION ALL

SELECT 
    t.id,
    t.user_id,
    t.title,
    t.description,
    t.is_special,
    t.notes,
    t.created_at,
    t.updated_at,
    gs.instance_time
FROM tasks t
JOIN LATERAL generate_series(
    t.scheduled_time,
    NOW() + INTERVAL '3 months',
    INTERVAL '2 weeks'
) gs(instance_time) ON t.recurrence_pattern->>'type' = 'biweekly'
WHERE t.is_recurring = TRUE AND t.is_active = TRUE

UNION ALL

SELECT 
    t.id,
    t.user_id,
    t.title,
    t.description,
    t.is_special,
    t.notes,
    t.created_at,
    t.updated_at,
    gs.instance_time
FROM tasks t
JOIN LATERAL generate_series(
    t.scheduled_time,
    NOW() + INTERVAL '3 months',
    INTERVAL '1 month'
) gs(instance_time) ON t.recurrence_pattern->>'type' = 'monthly'
WHERE t.is_recurring = TRUE AND t.is_active = TRUE;


-- Row Level Security (RLS) policies
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Create policy for tasks (users can only access their own tasks)
CREATE POLICY "Users can manage their own tasks" ON tasks
    FOR ALL USING (user_id = current_setting('app.current_user_id', true));

-- Create policy for reminders
CREATE POLICY "Users can view their own reminders" ON reminders
    FOR SELECT USING (
        task_id IN (
            SELECT id FROM tasks WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- Create function to set user context for RLS
CREATE OR REPLACE FUNCTION set_user_context(user_id TEXT)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_user_id', user_id, true);
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Grant necessary permissions
GRANT ALL ON tasks TO authenticated;
GRANT ALL ON reminders TO authenticated;
GRANT SELECT ON recurring_task_instances TO authenticated;
GRANT EXECUTE ON FUNCTION set_user_context(TEXT) TO authenticated;
