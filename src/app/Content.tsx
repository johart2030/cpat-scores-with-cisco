"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoaderCircle, Minus, Pencil, Plus, RefreshCcw, FileText, Cog, Grid3x3, StretchHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { setCookie } from "cookies-next";
import { useEffect, useRef, useState } from "react";
import { trpc } from "./_trpc/client";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, TooltipProps, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Payload } from "recharts/types/component/DefaultTooltipContent";
import Link from "next/link";
import { ColorPicker } from "@/components/ui/color-picker";
import { TRPCClientError } from "@trpc/client";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface TeamStats {
    teamNum: string;
    score: number;
    state: string;
    division: string;
    nationalRank: number;
    stateRank: number;
}

interface TeamHistoricalStats {
    date: string;
    [key: string]: number | string;
};

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
        return (
            <Card className="bg-card/50">
                <CardHeader>
                    <CardTitle>{new Date(label).toLocaleTimeString()}</CardTitle>
                </CardHeader>
                <CardContent>
                    {payload.map((p: Payload<number, string>) => (
                        <CardDescription key={p.dataKey}>
                            <span style={{ color: p.color }}>{p.name || p.dataKey}</span>: {p.value}
                        </CardDescription>
                    ))}
                </CardContent>
            </Card>
        );
    }

    return null;
}

const DEFAULT_COLORS = [
    "#ffadad",
    "#ffd6a5",
    "#caffbf",
    "#9bf6ff",
    "#a0c4ff",
    "#ffc6ff",
];

export default function Content({ defaultTeams }: {
    defaultTeams: {
        teamNum: string;
        teamName: string;
        color: string | null; // from migration
    }[]
}) {
    const [settings, setSettings] = useState<{
        display: "vertical" | "horizontal",
        showLegend: boolean,
        hideButtons: boolean
    }>(() => {
        return {
            display: "vertical",
            showLegend: true,
            hideButtons: false
        };
    });
    const [openSettings, setOpenSettings] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);
    const [showBulkImport, setShowBulkImport] = useState(false);
    const [activeGraph, setActiveGraph] = useState<"images" | "cisco">("cisco");
    const [teams, setTeams] = useState<{ teamNum: string, teamName: string, color: string }[]>(defaultTeams.map(team => ({ ...team, color: team.color || '#fff' })));
    const [selectedTeamNums, setSelectedTeamNums] = useState<string[]>(() => defaultTeams.map(team => team.teamNum));
    const [teamInputs, setTeamInputs] = useState<{ id: number, teamNum: string, teamName: string, color: string }[]>(defaultTeams.map(team => ({ ...team, color: team.color || '#fff', id: Math.random() })));
    const [teamStats, setTeamStats] = useState<TeamStats[]>(teams.map(team => ({ teamNum: team.teamNum, teamName: team.teamName, score: 0, state: "Unknown", division: "Unknown", nationalRank: 0, stateRank: 0 })));
    const [historicalStats, setHistoricalStats] = useState<TeamHistoricalStats[]>([]);
    const [bulkImportText, setBulkImportText] = useState("");
    const { toast } = useToast();

    const handleColorChange = (id: number, color: string) => {
        setTeamInputs(teamInputs.map((team) => team.id === id ? { ...team, color } : team));
    };

    const handleInputChange = (index: number, field: string, value: string) => {
        const newTeamInputs = [...teamInputs];
        newTeamInputs[index] = { ...newTeamInputs[index], [field]: value };
        setTeamInputs(newTeamInputs);
    };

    const handleRemoveInput = (index: number) => {
        const newTeamInputs = teamInputs.filter((_, i) => i !== index);
        setTeamInputs(newTeamInputs);
    };

    const handleAddInput = () => {
        setTeamInputs([...teamInputs, { id: Math.random(), teamNum: "", teamName: "", color: DEFAULT_COLORS[teamInputs.length % DEFAULT_COLORS.length] }]);
    };

    const handleBulkImport = () => {
        const lines = bulkImportText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const newTeams = lines.map((teamStr, index) => {
            const [teamNum, teamName] = teamStr.split(',').map(part => part.trim());

            if (!teamName) {
                return {
                    id: Math.random(),
                    teamNum: teamNum,
                    teamName: `Team ${teamNum}`,
                    color: DEFAULT_COLORS[(teamInputs.length + index) % DEFAULT_COLORS.length]
                }
            } else {
                return {
                    id: Math.random(),
                    teamNum: teamNum,
                    teamName: teamName,
                    color: DEFAULT_COLORS[(teamInputs.length + index) % DEFAULT_COLORS.length]
                }
            }
        });

        setTeamInputs([...teamInputs, ...newTeams]);
        setBulkImportText("");
        setShowBulkImport(false);
        toast({
            title: "Teams imported",
            description: `Successfully imported ${newTeams.length} team(s)`
        });
    };

    const handleBulkExport = () => {
        const exportText = teamInputs.map(team => `${team.teamNum},${team.teamName}`).join('\n');
        setBulkImportText(exportText);
        toast({
            title: "Teams exported",
            description: `Exported ${teamInputs.length} team(s) to text area`
        });
    };
    
    const saveTeams = (teamsToSave: { teamNum: string, teamName: string, color: string }[]) => {
        if (teamsToSave.some((team) => team.teamNum === "" || team.teamName === "")) {
            toast({
                title: "Invalid team",
                description: "Please make sure all teams have a team number and name"
            });
            return false;
        }

        if (teamsToSave.some((team) => !/^\d{2}-\d{4}$/.test(team.teamNum))) {
            toast({
                title: "Invalid team number",
                description: "Please make sure all team numbers are in the format: xx-xxxx"
            });
            return false;
        }
        
        setCookie("teams", btoa(JSON.stringify(teamsToSave)));
        setTeams(teamsToSave);
        setSelectedTeamNums(teamsToSave.map((team) => team.teamNum));
        return true;
    };

    const isTeamInputsSame = () => {
        if (teamInputs.length !== teams.length) return false;
        return teamInputs.every((team, index) => team.teamNum === teams[index].teamNum && team.teamName === teams[index].teamName && team.color === teams[index].color);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const filteredTeams = teamInputs.filter((team, index) => teamInputs.findIndex((t) => t.teamNum === team.teamNum) === index);

        if (saveTeams(filteredTeams)) {
            toast({
                title: "Teams saved",
                description: filteredTeams.length === 0 ? "All teams have been removed" : "Teams have been saved successfully"
            });
            
            setOpenEdit(false);
            setTeamStats(filteredTeams.map(team => ({ teamNum: team.teamNum, score: 0, state: "Unknown", division: "Unknown", nationalRank: 0, stateRank: 0 })));
            setHistoricalStats([]);
        }
    };

    const getTeamStats = trpc.getTeamScores.useMutation({
        onSuccess: (response) => {
            if(!response || !('data' in response) || response.data.length === 0) return;
            const filteredData = response.data.filter((team) => teams.map((t) => t.teamNum).includes(team.team_number));

            const tStats = filteredData.map((team) => ({
                teamNum: team.team_number,
                score: parseInt(team.ccs_score),
                state: team.location,
                division: team.division,
                nationalRank: team.national_rank,
                stateRank: team.state_rank,
            }));

            const missingTeamStats = teams.filter((team) => !tStats.map((t) => t.teamNum).includes(team.teamNum)).map((team) => ({
                teamNum: team.teamNum,
                score: 0,
                state: "Unknown",
                division: "Unknown",
                nationalRank: 0,
                stateRank: 0,
            }));

            setTeamStats([...tStats, ...missingTeamStats]);
        }, onError: (error) => {
            toast({
                title: "There was an error fetching the stats for the teams",
                description: "Please try again later.",
            });

            if(error instanceof TRPCClientError) {
                console.log(error.message);
            } else {
                console.log(error);
            }
        }
    })

    const lastGraphReq = useRef("");

    const getTeamGraphs = trpc.getTeamGraphs.useMutation({
        onSuccess: (data, sentTeams) => {
            if (sentTeams.join() !== lastGraphReq.current) return;
            if (Object.keys(data).length === 0) {
                setHistoricalStats([]);
                return;
            }
            const combinedData: { [key: string]: { date: string, [key: string]: number | string } } = {};

            Object.entries(data).forEach(([team, stats]) => {
                stats.forEach((stat) => {
                    const [datePart, timePart] = stat.time.split(' ');
                    const [month, day] = datePart.split('/');
                    const formattedDate = new Date(`${new Date().getFullYear()}-${month}-${day}T${timePart}:00`).toISOString();

                    if (!combinedData[formattedDate]) combinedData[formattedDate] = { date: formattedDate };
                    combinedData[formattedDate][team] = stat.value;
                });
            });

            const historicalStats = Object.values(combinedData);

            setHistoricalStats(historicalStats);
            console.log('refreshed with', teams.length, 'teams and', historicalStats.length, 'data points as well as', teamStats.length, 'team stats at', new Date().toLocaleTimeString());
            console.log('historical stats', historicalStats);
        }, onError: (error) => {
            toast({
                title: "There was an error fetching data for the graph",
                description: "Are you sure you entered the correct team numbers?",
            });

            if(error instanceof TRPCClientError) {
                console.log(error.message);
            } else {
                console.log(error);
            }
        }
    });

    const getTeamScores = async () => {
        return getTeamStats.mutate(teams.map((team) => team.teamNum));
    }

    const getGraphScores = async () => {
        lastGraphReq.current = selectedTeamNums.join();
        if (selectedTeamNums.length === 0) {
            setHistoricalStats([]);
            return;
        }
        return getTeamGraphs.mutate(selectedTeamNums);
    }

    const intervalId = useRef<NodeJS.Timeout | null>(null);
    const scoresFetchedFor = useRef<typeof teams | null>(null);

    useEffect(() => {
        if(teams.length > 0) {
            if (scoresFetchedFor.current !== teams) getTeamScores();
            getGraphScores();

            console.log('loaded with', teams.length, 'teams and', historicalStats.length, 'data points as well as', teamStats.length, 'team stats at', new Date().toLocaleTimeString());
        }
        scoresFetchedFor.current = teams;

        if (intervalId.current) clearInterval(intervalId.current);
        intervalId.current = setInterval(() => {
            if(teams.length > 0) {
                getTeamScores();
                getGraphScores();
            }
        }, 1000 * 60); // 5 minutes

        return () => {
            if(intervalId.current) clearInterval(intervalId.current);
        };
    }, [teams, selectedTeamNums])

    const graphSeries = Array.from(new Set(
        historicalStats.flatMap((point) => Object.keys(point).filter((key) => key !== "date"))
    )).map((dataKey, index) => {
        const separator = " | ";
        const isImageSeries = dataKey.includes(separator);
        const teamNum = isImageSeries ? dataKey.split(separator)[0] : dataKey;
        const team = teams.find((item) => item.teamNum === teamNum);
        const fallbackColor = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
        return {
            dataKey,
            label: isImageSeries ? dataKey.slice(teamNum.length + separator.length) : (team?.teamName || teamNum),
            color: isImageSeries ? fallbackColor : (team?.color || fallbackColor),
        };
    });

    const renderTeamSelector = () => (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 pb-3 mb-3">
            <span className="text-sm font-semibold text-neutral-300">Graph teams</span>
            {teams.map((team) => (
                <label key={team.teamNum} className="inline-flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                    <Checkbox
                        checked={selectedTeamNums.includes(team.teamNum)}
                        onCheckedChange={(checked) => setSelectedTeamNums((current) =>
                            checked === true
                                ? (current.includes(team.teamNum) ? current : [...current, team.teamNum])
                                : current.filter((teamNum) => teamNum !== team.teamNum)
                        )}
                    />
                    <span>{team.teamName || team.teamNum}</span>
                </label>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedTeamNums(teams.map((team) => team.teamNum))}>All</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedTeamNums([])}>None</Button>
        </div>
    );

    return (
        <div className="w-full h-full min-h-0 flex flex-col overflow-y-auto">
            {teams.length > 0 && (
                <section aria-label="Score graphs" className="w-full shrink-0 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 sm:p-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-neutral-100">Score graphs</h2>
                            <p className="mt-1 text-sm text-neutral-400">Choose which score view to display.</p>
                        </div>
                        <div className="inline-flex rounded-lg border border-neutral-700 p-1" role="tablist" aria-label="Score graph type">
                            <button type="button" role="tab" aria-selected={activeGraph === "images"} onClick={() => setActiveGraph("images")} className={`rounded-md px-4 py-2 text-sm transition-colors ${activeGraph === "images" ? "bg-neutral-700 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}>Images</button>
                            <button type="button" role="tab" aria-selected={activeGraph === "cisco"} onClick={() => setActiveGraph("cisco")} className={`rounded-md px-4 py-2 text-sm transition-colors ${activeGraph === "cisco" ? "bg-neutral-700 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}>Cisco</button>
                        </div>
                    </div>
                    {activeGraph === "images" ? (
                        <>
                            {renderTeamSelector()}
                            <div className="h-72 w-full">
                                {historicalStats.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={[...historicalStats].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                                            <CartesianGrid vertical={false} stroke="#404040" />
                                            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(date: string) => new Date(date).toLocaleTimeString()} />
                                            {!settings.hideButtons && <Tooltip content={<CustomTooltip />} />}
                                            <YAxis tickLine={false} axisLine={false} />
                                            {graphSeries.map((series) => <Line key={series.dataKey} dataKey={series.dataKey} name={series.label} type="monotone" stroke={series.color} strokeWidth={2} dot={false} />)}
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-neutral-400">
                                        {selectedTeamNums.length > 0 && <LoaderCircle className="animate-spin" />}
                                        <div>
                                            <h3 className="font-semibold text-neutral-300">{selectedTeamNums.length === 0 ? "No teams selected" : "No image history yet"}</h3>
                                            <p className="mt-1 text-sm">{selectedTeamNums.length === 0 ? "Select one or more teams above to view their image scores." : "Image score history will appear when data is available."}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {settings.showLegend && graphSeries.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                                    {graphSeries.map((series) => <div key={`${series.dataKey}-legend`} className="flex items-center gap-x-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: series.color }} /><span className="text-sm text-neutral-300">{series.label}</span></div>)}
                                </div>
                            )}
                        </>
                    ) : (
                        teamStats.some((team) => team.state !== "Unknown") ? (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={teamStats.map((team) => ({ ...team, teamName: teams.find((item) => item.teamNum === team.teamNum)?.teamName || team.teamNum }))} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                        <CartesianGrid vertical={false} stroke="#404040" />
                                        <XAxis dataKey="teamNum" tickLine={false} axisLine={false} tickMargin={10} />
                                        <YAxis tickLine={false} axisLine={false} width={48} />
                                        {!settings.hideButtons && <Tooltip formatter={(value, _name, item) => [value, item.payload.teamName]} labelFormatter={(label) => `Team ${label}`} contentStyle={{ backgroundColor: "#171717", borderColor: "#404040", borderRadius: 8 }} />}
                                        <Bar dataKey="score" name="Cisco score" radius={[4, 4, 0, 0]} activeBar={false}>
                                            {teamStats.map((team) => <Cell key={team.teamNum} fill={teams.find((item) => item.teamNum === team.teamNum)?.color || "#60a5fa"} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex h-72 items-center justify-center text-sm text-neutral-400">Cisco scores will appear here when they are available.</div>
                        )
                    )}
                </section>
            )}
            <div className={"w-full flex-1 min-h-0 p-3 " + (settings.display === "horizontal" ? "flex flex-col gap-3 overflow-y-auto" : "grid auto-rows-max grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] content-start gap-3 overflow-y-auto")}>
                {teams.length > 0 ? teamStats.map((teamStat) => {
                    const team = teams.find((item) => item.teamNum === teamStat.teamNum);
                    const teamName = team?.teamName || teamStat.teamNum;
                    return (
                        <Link
                            href={`https://scoreboard.uscyberpatriot.org/team.php?team=${teamStat.teamNum}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            key={teamStat.teamNum}
                            className="flex flex-col justify-center rounded-lg border px-5 py-3 transition-colors hover:bg-neutral-900/60"
                            style={{ borderColor: team?.color || "#404040" }}
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <h3 className="truncate text-lg font-semibold text-neutral-200" title={teamName}>{teamName}</h3>
                                    <h1 className="truncate text-4xl font-semibold text-neutral-100">{teamStat.teamNum}</h1>
                                </div>
                                <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: team?.color || "#60a5fa" }} />
                            </div>
                            {teamStat.state !== "Unknown" ? (
                                <div className="mt-2 flex items-center justify-between gap-3">
                                    <p className="truncate text-neutral-300">{teamStat.score} <span className="text-neutral-500">- {teamStat.state} ({teamStat.division})</span></p>
                                    <p className="shrink-0 text-sm text-neutral-400">#{teamStat.nationalRank} <span className="text-neutral-500">/ #{teamStat.stateRank}</span></p>
                                </div>
                            ) : <p className="mt-2 text-neutral-500">Waiting to start...</p>}
                        </Link>
                    );
                }) : (
                    <div className="m-auto max-w-lg space-y-3.5 text-center">
                        <div>
                            <h1 className="font-semibold tracking-wide text-neutral-300">No teams to track</h1>
                            <p className="mt-1 text-sm text-neutral-400">Add teams with the pencil button to see their Cisco and image scores.</p>
                        </div>
                        <div className="flex justify-center gap-2">
                            <Button onClick={() => setOpenEdit(true)} variant="outline">Edit Teams</Button>
                            <Link href="https://github.com/okdargy/cpat-scores"><Button variant="outline">Star on GitHub</Button></Link>
                        </div>
                    </div>
                )}
            </div>
            <div className={"absolute bottom-3 right-3 space-x-2 transition-opacity " + (settings.hideButtons ? "opacity-0 hover:opacity-100" : "opacity-50 hover:opacity-100")}>
                <Button variant="outline" className="opacity-50 hover:opacity-100 transition-opacity" onClick={() => { getTeamScores(); getGraphScores(); }}>
                    <RefreshCcw />
                    Refresh
                </Button>

                <Dialog open={openSettings} onOpenChange={setOpenSettings}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="opacity-50 hover:opacity-100 transition-opacity">
                            <Cog />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogTitle>
                            Settings
                        </DialogTitle>
                        <DialogDescription>
                            Customize how you view team scores and statistics
                        </DialogDescription>
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium">Display Mode</h3>
                                <div className="flex gap-x-2">
                                    <Button
                                        variant={settings.display === "vertical" ? "default" : "outline"}
                                        onClick={() => setSettings({ ...settings, display: "vertical" })}
                                        className="flex-1"
                                    >
                                        <Grid3x3 className="mr-2 h-4 w-4" />
                                        Vertical
                                    </Button>
                                    <Button
                                        variant={settings.display === "horizontal" ? "default" : "outline"}
                                        onClick={() => setSettings({ ...settings, display: "horizontal" })}
                                        className="flex-1"
                                    >
                                        <StretchHorizontal className="mr-2 h-4 w-4" />
                                        Horizontal
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-sm font-medium">Display Options</h3>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="showLegend"
                                        checked={settings.showLegend}
                                        onCheckedChange={(checked) => setSettings({ ...settings, showLegend: checked as boolean })}
                                    />
                                    <Label htmlFor="showLegend" className="cursor-pointer">
                                        Show legend below chart
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="hideButtons"
                                        checked={settings.hideButtons}
                                        onCheckedChange={(checked) => setSettings({ ...settings, hideButtons: checked as boolean })}
                                    />
                                    <Label htmlFor="hideButtons" className="cursor-pointer">
                                        Hide control buttons
                                    </Label>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                <Dialog open={openEdit} onOpenChange={setOpenEdit}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="opacity-50 hover:opacity-100 transition-opacity">
                            <Pencil />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogTitle>
                            Edit Teams
                        </DialogTitle>
                        <DialogDescription>
                            Enter the teams you want to track below. Customize their names and colors to your preference!
                        </DialogDescription>
                        <div>
                            <div className="space-y-4">
                                {showBulkImport && (
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-medium">Bulk Import/Export</h3>
                                        <div className="flex gap-x-2">
                                            <Textarea
                                                placeholder={`18-0001,Team Name\n18-0002,Another Team`}
                                                value={bulkImportText}
                                                onChange={(e) => setBulkImportText(e.target.value)}
                                                className="flex-1"
                                            />
                                            <div className="flex flex-col gap-y-2">
                                                <Button 
                                                    type="button" 
                                                    onClick={handleBulkImport} 
                                                    variant={"outline"}
                                                    disabled={!bulkImportText.trim()}
                                                >
                                                    Import
                                                </Button>
                                                <Button 
                                                    type="button" 
                                                    onClick={handleBulkExport} 
                                                    variant={"outline"}
                                                    disabled={teamInputs.length === 0}
                                                >
                                                    Export
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <form className="flex flex-col gap-y-3" onSubmit={handleSubmit}>
                                    {teamInputs.map((team, index) => (
                                        <div key={index} className="flex gap-x-3">
                                            <ColorPicker color={team.color} onChange={(color) => handleColorChange(team.id, color)} />
                                            <div className="flex gap-x-2">
                                                <Input
                                                    type="text"
                                                    placeholder="Team Number"
                                                    value={team.teamNum}
                                                    onChange={(e) => handleInputChange(index, "teamNum", e.target.value)}
                                                />
                                                <Input
                                                    type="text"
                                                    placeholder="Team Name"
                                                    value={team.teamName}
                                                    onChange={(e) => handleInputChange(index, "teamName", e.target.value)}
                                                />
                                                <Button type="button" onClick={() => handleRemoveInput(index)} variant={"outline"}>
                                                    <Minus />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex gap-x-2 w-full">
                                        <Button className="w-full" type="submit" variant={"outline"} disabled={isTeamInputsSame()}>
                                            Save Teams
                                        </Button>
                                        <Button type="button" onClick={handleAddInput} variant={"outline"}>
                                            <Plus />
                                        </Button>
                                        <Button 
                                            type="button" 
                                            onClick={() => setShowBulkImport(!showBulkImport)} 
                                            variant={showBulkImport ? "secondary" : "outline"}
                                            title="Toggle bulk import"
                                        >
                                            <FileText />
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
};
