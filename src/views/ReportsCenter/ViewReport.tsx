/*
 * Copyright (C)  Online-Go.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import * as React from "react";
import * as moment from "moment";
import Select from "react-select";
import { useUser } from "hooks";
import { report_categories } from "Report";
import { report_manager, Report } from "report_manager";
import { AutoTranslate } from "AutoTranslate";
import { _, pgettext } from "translate";
import { Player } from "Player";
import { Link } from "react-router-dom";
import { post } from "requests";
import { PlayerCacheEntry } from "player_cache";
import { errorAlerter, ignore } from "misc";
import { UserHistory } from "./UserHistory";
import { ReportedGame } from "./ReportedGame";
import { AppealView } from "./AppealView";
import { get } from "requests";

// Used for saving updates to the report
let report_note_id = 0;
let report_note_text = "";
let report_note_update_timeout = null;

interface ViewReportProps {
    reports: Report[];
    onChange: (report_id: number) => void;
    report_id: number;
}

let cached_moderators = [];

export function ViewReport({ report_id, reports, onChange }: ViewReportProps): JSX.Element {
    const user = useUser();
    const [moderatorNote, setModeratorNote] = React.useState("");
    const [moderators, setModerators] = React.useState(cached_moderators);
    const [report, setReport] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [moderator_id, setModeratorId] = React.useState(report?.moderator?.id);
    const [reportState, setReportState] = React.useState(report?.state);

    React.useEffect(() => {
        if (report_id) {
            report_manager
                .getReport(report_id)
                .then((report) => {
                    setError(null);
                    setReport(report);
                    setModeratorId(report?.moderator?.id);
                    setReportState(report?.state);
                })
                .catch((err) => {
                    console.error(err);
                    setError(err + "");
                });
        } else {
            setReport(null);
            setError(null);
            setModeratorId(null);
            setReportState(null);
        }
    }, [report_id]);

    React.useEffect(() => {
        const onUpdate = (r) => {
            if (r.id === report?.id) {
                setReport(r);
                setModeratorId(r?.moderator?.id);
                setReportState(r?.state);
            }
        };
        report_manager.on("incident-report", onUpdate);
        return () => {
            report_manager.off("incident-report", onUpdate);
        };
    }, [report]);

    React.useEffect(() => {
        if (cached_moderators.length === 0 || moderators.length === 0) {
            get("players/?is_moderator=true&page_size=100")
                .then((res) => {
                    cached_moderators = res.results.sort(
                        (a: PlayerCacheEntry, b: PlayerCacheEntry) => {
                            if (a.id === user.id) {
                                return -1;
                            }
                            if (b.id === user.id) {
                                return 1;
                            }
                            return a.username.localeCompare(b.username);
                        },
                    );
                    setModerators(cached_moderators);
                })
                .catch(errorAlerter);
        }
    }, []);

    React.useEffect(() => {
        setModeratorId(report?.moderator?.id);
    }, [report?.moderator?.id]);

    React.useEffect(() => {
        if (document.activeElement.nodeName !== "TEXTAREA") {
            setModeratorNote(report?.moderator_note || "");
        }
    }, [report?.moderator_note]);

    React.useEffect(() => {
        setReportState(report?.state);
    }, [report?.state]);

    const setAndSaveModeratorNote = React.useCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setModeratorNote(event.target.value);

            if (report_note_id !== 0 && report_note_id !== report.id) {
                window.alert(
                    "Hold your horses, already saving an update, though you should never see this contact anoek",
                );
            } else {
                report_note_id = report.id;
                report_note_text = event.target.value;

                if (!report_note_update_timeout) {
                    report_note_update_timeout = setTimeout(() => {
                        post("moderation/incident/%%", report.id, {
                            id: report.id,
                            action: "note",
                            note: report_note_text,
                        })
                            .then(ignore)
                            .catch(errorAlerter);
                        report_note_id = 0;
                        report_note_text = "";
                        report_note_update_timeout = null;
                    }, 250);
                }
            }
        },
        [report],
    );

    const assignToModerator = React.useCallback(
        (id: number) => {
            setModeratorId(id);
            post("moderation/incident/%%", report.id, {
                id: report.id,
                action: "assign",
                moderator_id: id,
            })
                .then(ignore)
                .catch(errorAlerter);
        },
        [report],
    );

    if (!report || report_id === 0) {
        return (
            <div id="ViewReport">
                <div className="no-report-selected">All done!</div>
            </div>
        );
    }

    if (error) {
        return (
            <div id="ViewReport">
                <div className="error">{error}</div>
            </div>
        );
    }

    const category = report_categories.find((c) => c.type === report.report_type);
    const claimed_by_me = report.moderator?.id === user.id;
    const report_in_reports = reports.find((r) => r.id === report.id);
    let next_report: Report = null;
    let prev_report: Report = null;
    for (let i = 0; i < reports.length; i++) {
        if (reports[i].id === report.id) {
            if (i + 1 < reports.length) {
                next_report = reports[i + 1];
            }
            if (i - 1 >= 0) {
                prev_report = reports[i - 1];
            }
            break;
        }
    }

    const next = () => {
        if (next_report) {
            onChange(next_report.id);
        } else {
            onChange(0);
        }
    };

    const prev = () => {
        if (prev_report) {
            onChange(prev_report.id);
        }
    };

    return (
        <div id="ViewReport">
            <div className="header">
                <div className="newer-older-buttons">
                    {(prev_report && (
                        <button className="default" onClick={prev}>
                            &lt; Newer
                        </button>
                    )) || <span className="empty" />}

                    {(next_report && (
                        <button className="default" onClick={next}>
                            Older &gt;
                        </button>
                    )) || <span className="empty" />}
                </div>

                {report_in_reports ? (
                    <Select
                        id="ReportsCenterSelectReport"
                        className="reports-center-category-option-select"
                        classNamePrefix="ogs-react-select"
                        value={reports.filter((r) => r.id === report.id)[0]}
                        getOptionValue={(r) => r.id.toString()}
                        onChange={(r: Report) => onChange(r.id)}
                        options={reports}
                        isClearable={false}
                        isSearchable={false}
                        blurInputOnSelect={true}
                        components={{
                            Option: ({ innerRef, innerProps, isFocused, isSelected, data }) => (
                                <div
                                    ref={innerRef}
                                    {...innerProps}
                                    className={
                                        "reports-center-selected-report" +
                                        (isFocused ? "focused " : "") +
                                        (isSelected ? "selected" : "")
                                    }
                                >
                                    {"R" + `${data.id}`.slice(-3)}
                                </div>
                            ),
                            SingleValue: ({ innerProps, data }) => (
                                <span {...innerProps} className="reports-center-selected-report">
                                    {"R" + `${data.id}`.slice(-3)}
                                </span>
                            ),
                            ValueContainer: ({ children }) => (
                                <div className="reports-center-selected-report-container">
                                    {children}
                                </div>
                            ),
                        }}
                    />
                ) : (
                    <span className="historical-report-number">
                        {"R" + `${report.id}`.slice(-3)}
                    </span>
                )}

                <span className="moderator">
                    <Select
                        id="ReportsCenterSelectModerator"
                        className="reports-center-category-option-select"
                        classNamePrefix="ogs-react-select"
                        value={moderators.filter((m) => m.id === moderator_id)[0]}
                        getOptionValue={(data) => data.type}
                        onChange={(m: any) => assignToModerator(m.id)}
                        options={moderators}
                        isClearable={false}
                        isSearchable={false}
                        blurInputOnSelect={true}
                        placeholder={"Moderator.."}
                        components={{
                            Option: ({ innerRef, innerProps, isFocused, isSelected, data }) => (
                                <div
                                    ref={innerRef}
                                    {...innerProps}
                                    className={
                                        "reports-center-assigned-moderator" +
                                        (isFocused ? "focused " : "") +
                                        (isSelected ? "selected" : "")
                                    }
                                >
                                    {data.username}
                                </div>
                            ),
                            SingleValue: ({ innerProps, data }) => (
                                <span {...innerProps} className="reports-center-assigned-moderator">
                                    {data.username}
                                </span>
                            ),
                            ValueContainer: ({ children }) => (
                                <div className="reports-center-assigned-moderator-container">
                                    {children}
                                </div>
                            ),
                        }}
                    />

                    {report.moderator ? (
                        <>
                            {(report.moderator.id === user.id || null) && (
                                <button
                                    className="danger xs"
                                    onClick={() => {
                                        setReportState(report?.moderator ? "claimed" : "pending");
                                        void report_manager.unclaim(report.id);
                                    }}
                                >
                                    {_("Unclaim")}
                                </button>
                            )}
                        </>
                    ) : (
                        <button
                            className="primary xs"
                            onClick={() => {
                                report.moderator = user;
                                setReportState("claimed");
                                void report_manager.claim(report.id);
                            }}
                        >
                            {_("Claim")}
                        </button>
                    )}
                </span>
            </div>

            <div className="reported-user">
                <h3 className="users">
                    <span className="reported-user">
                        {pgettext(
                            "A label for the user name who has been reported to mods (followed by colon and the username)",
                            "Reported User",
                        )}
                        : <Player user={report.reported_user} />
                    </span>
                    <span className="reporting-user">
                        {pgettext(
                            "A label for the user name that reported an incident (followed by colon and the username)",
                            "Reported by",
                        )}
                        : <Player user={report.reporting_user} />
                    </span>
                </h3>
            </div>

            <h3>
                {category?.title}
                <span className="when">{moment(report.created).fromNow()}</span>
            </h3>

            <div className="notes-container">
                {(report.reporter_note || null) && (
                    <div className="notes">
                        <h3>Reporter Notes</h3>
                        <div className="Card">
                            {report.reporter_note_translation ? (
                                <>
                                    {report.reporter_note_translation.source_text}
                                    {(report.reporter_note_translation.target_language !==
                                        report.reporter_note_translation.source_language ||
                                        null) && (
                                        <>
                                            <div className="source-to-target-languages">
                                                {report.reporter_note_translation.source_language}{" "}
                                                =&gt;{" "}
                                                {report.reporter_note_translation.target_language}
                                            </div>
                                            <div className="translated">
                                                {report.reporter_note_translation.target_text}
                                            </div>
                                        </>
                                    )}
                                </>
                            ) : (
                                <AutoTranslate source={report.reporter_note} />
                            )}
                        </div>
                    </div>
                )}

                {(report.system_note || null) && (
                    <div className="notes">
                        <h3>System Notes</h3>
                        <div className="Card">{report.system_note}</div>
                    </div>
                )}

                {(user.is_moderator || null) && (
                    <div className="notes">
                        <h3>Moderator Notes</h3>
                        <textarea value={moderatorNote} onChange={setAndSaveModeratorNote} />
                    </div>
                )}
            </div>

            <div className="actions">
                {reportState !== "resolved" && claimed_by_me && (
                    <button
                        className="success"
                        onClick={() => {
                            void report_manager.good_report(report.id);
                            next();
                        }}
                    >
                        Close as good report
                    </button>
                )}

                {reportState !== "resolved" && claimed_by_me && (
                    <button
                        className="reject"
                        onClick={() => {
                            void report_manager.bad_report(report.id);
                            next();
                        }}
                    >
                        Close as bad report
                    </button>
                )}

                {reportState === "resolved" && (
                    <button
                        className="default"
                        onClick={() => void report_manager.reopen(report.id)}
                    >
                        Re-open
                    </button>
                )}

                {!claimed_by_me && !report.moderator && (
                    <button
                        className="primary"
                        onClick={() => void report_manager.claim(report.id)}
                    >
                        Claim
                    </button>
                )}

                {!claimed_by_me && (
                    <button
                        className="default"
                        onClick={() => {
                            void report_manager.ignore(report.id);
                            next();
                        }}
                    >
                        Ignore
                    </button>
                )}
            </div>

            <hr />

            {(report.url || null) && (
                <a href={report.url} target="_blank">
                    {report.url}
                </a>
            )}

            {report.reported_game && <ReportedGame game_id={report.reported_game} />}

            {report.report_type === "appeal" && <AppealView user_id={report.reported_user.id} />}

            {report.reported_review && (
                <span>
                    {_("Review")}:{" "}
                    <Link to={`/review/${report.reported_review}`}>##{report.reported_review}</Link>
                </span>
            )}

            {report.reported_conversation && (
                <div className="reported-conversation">
                    {report.reported_conversation.content.map((line, index) => (
                        <div className="chatline" key={index}>
                            {line}
                        </div>
                    ))}
                </div>
            )}

            <hr />

            <UserHistory user={report.reported_user} />
        </div>
    );
}
