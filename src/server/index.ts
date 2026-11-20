import { z } from 'zod';
import { router, publicProcedure } from './trpc';

const teamIdSchema = z.string().regex(/^\d{2}-\d{4}$/);

type TeamScore = {
    team_id: number;
    team_number: string;
    images: number;
    play_time: string;
    score_time: string;
    ccs_score: string;
    location: string;
    division: string;
    tier: string;
    code: string;
};

type TeamScoreWithRankings = TeamScore & {
    national_rank: number;
    state_rank: number;
};

export const appRouter = router({
    getTeamScores: publicProcedure.input(z.array(teamIdSchema)).mutation(async (opts) => {
        if(opts.input.length == 0) return {}
        
        const allTeamsResponse = await fetch('https://scoreboard.uscyberpatriot.org/api/team/scores.php');
        const allTeamsData = await allTeamsResponse.json();
        const allTeams: TeamScore[] = allTeamsData.data || [];
        
        const teamsByState = new Map<string, TeamScore[]>();
        allTeams.forEach(team => {
            const location = team.location;
            if (!teamsByState.has(location)) {
                teamsByState.set(location, []);
            }
            teamsByState.get(location)!.push(team);
        });
        
        const requestedTeams = allTeams.filter(team => 
            opts.input.includes(team.team_number)
        );
        
        const teamsWithRankings: TeamScoreWithRankings[] = requestedTeams.map(team => {
            const nationalRank = allTeams.findIndex(t => t.team_number === team.team_number) + 1;
            
            const stateTeams = teamsByState.get(team.location) || [];
            const stateRank = stateTeams.findIndex(t => t.team_number === team.team_number) + 1;
            
            return {
                ...team,
                national_rank: nationalRank,
                state_rank: stateRank
            };
        });
        
        return { data: teamsWithRankings };
    }),
    getAllTeamsWithRankings: publicProcedure.query(async () => {
        const response = await fetch('https://scoreboard.uscyberpatriot.org/api/team/scores.php');
        const data = await response.json();
        const teams: TeamScore[] = data.data || [];

        const teamsWithNationalRank = teams.map((team, index) => ({
            ...team,
            national_rank: index + 1
        }));

        const teamsByState = new Map<string, TeamScore[]>();
        teams.forEach(team => {
            const location = team.location;
            if (!teamsByState.has(location)) {
                teamsByState.set(location, []);
            }
            teamsByState.get(location)!.push(team);
        });

        const teamsWithRankings: TeamScoreWithRankings[] = teamsWithNationalRank.map(team => {
            const stateTeams = teamsByState.get(team.location) || [];
            const stateRank = stateTeams.findIndex(t => t.team_number === team.team_number) + 1;
            
            return {
                ...team,
                state_rank: stateRank
            };
        });

        return {
            data: teamsWithRankings,
            total_teams: teamsWithRankings.length
        };
    }),
    getTeamGraphs: publicProcedure.input(z.array(teamIdSchema)).mutation(async (opts) => {
        if(opts.input.length == 0) return {}
        const data = await fetchChart(opts.input);

        if (opts.input.length > 1 && data?.cols?.[1] && !data.cols[1].label.includes('-')) {
            const perTeam = await Promise.all(opts.input.map(async (team) =>
                [team, processData(await fetchChart([team]), 1, [team])[team] ?? []] as const
            ));
            return Object.fromEntries(perTeam);
        }

        return processData(data, opts.input.length, opts.input);
    })
});

async function fetchChart(teams: string[]): Promise<Data> {
    const response = await fetch(`https://scoreboard.uscyberpatriot.org/api/image/chart.php?team[]=${teams.join("&team[]=")}`);
    return response.json();
}

type Data = {
    cols: { label: string }[];
    rows: { c: { v: string | number | null }[] }[];
};

type OrganizedData = { [key: string]: { time: string, value: number }[] };

function processData(data: Data, numTeams: number, teams: string[]): OrganizedData {
    const cols = data?.cols ?? [];
    const rows = data?.rows ?? [];
    if (cols.length < 2 || teams.length === 0) return {};

    const singleTeam = numTeams === 1;
    const lastValueByColumn: Record<string, number> = {};
    const seriesKeys = cols.slice(1).map((col) => {
        if (!singleTeam) return col.label.split('_')[0];

        const category = col.label.replace(/_/g, ' ').trim();
        return `${teams[0]} | ${category || 'Image score'}`;
    });

    const organizedData: OrganizedData = {};
    seriesKeys.forEach((key) => {
        if (!organizedData[key]) organizedData[key] = [];
    });
    if (singleTeam) organizedData[teams[0]] = [];

    rows.forEach((row) => {
        const time = String(row.c?.[0]?.v ?? '');
        row.c.slice(1).forEach((cell, index) => {
            const columnLabel = cols[index + 1]?.label;
            const seriesKey = seriesKeys[index];
            if (!columnLabel || !seriesKey || !time) return;

            let rawValue: string | number | null = cell.v;
            if (rawValue === 'null' || rawValue === null) {
                const previousValue = lastValueByColumn[columnLabel];
                if (previousValue === undefined) return;
                rawValue = previousValue;
            }

            const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
            if (!Number.isFinite(value)) return;
            lastValueByColumn[columnLabel] = value;

            for (const key of singleTeam ? [seriesKey, teams[0]] : [seriesKey]) {
                const series = organizedData[key];
                const existingPoint = series.find((point) => point.time === time);
                if (existingPoint) existingPoint.value += value;
                else series.push({ time, value });
            }
        });
    });

    return organizedData;
}

export type AppRouter = typeof appRouter;
