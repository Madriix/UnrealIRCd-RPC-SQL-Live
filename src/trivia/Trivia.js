const config = require('./../../config');

// ============================================================================
// GAMESBOT - IRC TRIVIA BOT
// ============================================================================

/**
 * GamesBot - IRC Trivia Bot
 * Provides interactive trivia games in channels
 */

class Trivia {
    constructor(instance) {
        this.GAMES_BOT_NICK = config.ircbot.nick;
        this.GAMES_PREFIX = "!";
        // Trivia database
        this.triviaQuestions = [
            { question: "What is the capital of France?", answer: "Paris", category: "Geography" },
            { question: "Who wrote 'Romeo and Juliet'?", answer: "Shakespeare", category: "Literature" },
            { question: "What is the largest planet in our solar system?", answer: "Jupiter", category: "Science" },
            { question: "In what year did World War II end?", answer: "1945", category: "History" },
            { question: "What is the chemical symbol for gold?", answer: "Au", category: "Science" },
            { question: "Who painted the Mona Lisa?", answer: "Leonardo da Vinci", category: "Art" },
            { question: "What is the smallest prime number?", answer: "2", category: "Math" },
            { question: "What is the capital of Japan?", answer: "Tokyo", category: "Geography" },
            { question: "Who invented the telephone?", answer: "Alexander Graham Bell", category: "History" },
            { question: "What is the speed of light in km/s?", answer: "299792", category: "Science" },
            { question: "How many continents are there?", answer: "7", category: "Geography" },
            { question: "What is the largest ocean on Earth?", answer: "Pacific", category: "Geography" },
            { question: "Who wrote '1984'?", answer: "George Orwell", category: "Literature" },
            { question: "What is the square root of 144?", answer: "12", category: "Math" },
            { question: "What year did the Titanic sink?", answer: "1912", category: "History" },
            { question: "What is the chemical formula for water?", answer: "H2O", category: "Science" },
            { question: "Who was the first president of the United States?", answer: "George Washington", category: "History" },
            { question: "What is the boiling point of water in Celsius?", answer: "100", category: "Science" },
            { question: "How many sides does a hexagon have?", answer: "6", category: "Math" },
            { question: "What is the largest mammal on Earth?", answer: "Blue Whale", category: "Science" },
            { question: "In which city is the Eiffel Tower located?", answer: "Paris", category: "Geography" },
            { question: "What does CPU stand for?", answer: "Central Processing Unit", category: "Technology" },
            { question: "Who discovered penicillin?", answer: "Alexander Fleming", category: "Science" },
            { question: "What is the currency of Japan?", answer: "Yen", category: "Geography" },
            { question: "How many planets are in our solar system?", answer: "8", category: "Science" },
            { question: "What is the capital of Italy?", answer: "Rome", category: "Geography" },
            { question: "Who wrote 'The Great Gatsby'?", answer: "F. Scott Fitzgerald", category: "Literature" },
            { question: "What is 15 multiplied by 8?", answer: "120", category: "Math" },
            { question: "What is the longest river in the world?", answer: "Nile", category: "Geography" },
            { question: "What does HTML stand for?", answer: "HyperText Markup Language", category: "Technology" }
        ];

        // Active trivia games per channel
        this.activeTrivia = {}; // { channelName: { question: obj, startTime: timestamp, answered: bool, autoMode: bool, remainingRounds: number } }

        // Player scores
        this.playerScores = {}; // { playerName: points }

        // Trivia cooldown
        this.triviaCooldown = {};
        this.TRIVIA_COOLDOWN_MS = 5000;
        this.TRIVIA_TIMEOUT_MS = 45000; // 45 seconds to answer
        this.NEXT_QUESTION_DELAY = 5000; // 5 seconds before next question in auto mode

        this.timer = null;

        this.bot = instance.bot;

        if (config.trivia.enable) {
            this.init();
        }

    }

    init() {
        // Cleanup old trivia sessions periodically
        setInterval(() => {
            const now = Date.now();
            for (const channelName in this.activeTrivia) {
                if (this.activeTrivia[channelName].answered && (now - this.activeTrivia[channelName].startTime > 120000)) {
                    delete this.activeTrivia[channelName];
                }
            }
        }, 60 * 1000);
    }


    /**
     * Helper function to send GamesBot response to channel
     */
    gamesBotReply(channel, message) {
        this.bot.say(channel, message);
    }

    /**
     * Normalize answer for comparison (lowercase, trim, remove punctuation)
     */
    normalizeAnswer(answer) {
        return answer.toLowerCase()
            .trim()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
            .replace(/\s+/g, ' ');
    }

    /**
     * Check if answer is correct
     */
    checkAnswer(userAnswer, correctAnswer) {
        const normalized = this.normalizeAnswer(userAnswer);
        const correct = this.normalizeAnswer(correctAnswer);

        // Exact match
        if (normalized === correct) {
            return true;
        }

        // Contains the answer
        /*if (normalized.indexOf(correct) !== -1 || correct.indexOf(normalized) !== -1) {
            return true;
        }*/

        return false;
    }

    /**
     * Start a new trivia question
     */
    startTrivia(channel, rounds) {
        const channelName = channel;

        // Check if there's already an active question
        if (this.activeTrivia[channelName] && !this.activeTrivia[channelName].answered) {
            this.gamesBotReply(channel, 'A question is already active! Answer it first or wait for timeout.');
            return;
        }

        // Determine if auto mode (infinite or limited rounds)
        const autoMode = true;
        const remainingRounds = -1; // -1 = infinite

        if (rounds !== undefined && rounds !== null) {
            remainingRounds = parseInt(rounds);
            if (isNaN(remainingRounds) || remainingRounds < 1) {
                this.gamesBotReply(channel, 'Invalid number of rounds. Using infinite mode.');
                remainingRounds = -1;
            }
        }

        // Pick random question
        const question = this.triviaQuestions[Math.floor(Math.random() * this.triviaQuestions.length)];

        // Store active question
        this.activeTrivia[channelName] = {
            question: question,
            startTime: Date.now(),
            answered: false,
            autoMode: autoMode,
            remainingRounds: remainingRounds
        };

        // Announce question
        this.gamesBotReply(channel, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        if (remainingRounds > 0) {
            this.gamesBotReply(channel, 'TRIVIA TIME! Round ' + (rounds - remainingRounds + 1) + '/' + rounds + ' - Category: ' + question.category);
        } else {
            this.gamesBotReply(channel, 'TRIVIA TIME! Category: ' + question.category);
        }
        this.gamesBotReply(channel, 'QUESTION: ' + question.question);
        this.gamesBotReply(channel, 'You have 45 seconds to answer!');
        if (autoMode) {
            this.gamesBotReply(channel, 'Auto mode: Next question in 5 seconds after answer/timeout');
        }
        this.gamesBotReply(channel, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        this.timeUp(channel);

    }


    timeUp(channel) {

        const channelName = channel;

        clearTimeout(this.timer);
        this.timer = null;

        // Set timeout to reveal answer
        this.timer = setTimeout(() => {
            if (this.activeTrivia[channelName] && !this.activeTrivia[channelName].answered) {
                this.gamesBotReply(channel, 'Time\'s up! The answer was: ' + this.activeTrivia[channelName].question.answer);
                this.activeTrivia[channelName].answered = true;

                // Auto-continue to next question if in auto mode
                if (this.activeTrivia[channelName].autoMode) {
                    this.scheduleNextQuestion(channel, this.activeTrivia[channelName].remainingRounds);
                } else {
                    this.gamesBotReply(channel, 'Type !trivia to start a new question!');
                }
            }
        }, this.TRIVIA_TIMEOUT_MS);
    }

    /**
     * Schedule the next trivia question
     */
    scheduleNextQuestion(channel, remainingRounds) {
        const channelName = channel;

        setTimeout(() => {
            // Check if trivia is still active and not stopped
            if (!this.activeTrivia[channelName]) {
                return;
            }

            // Decrement rounds if not infinite
            if (remainingRounds > 0) {
                remainingRounds--;
                if (remainingRounds === 0) {
                    this.gamesBotReply(channel, 'Trivia game complete! Type !trivia to play again!');
                    delete this.activeTrivia[channelName];
                    return;
                }
            }

            clearTimeout(this.timer);
            this.timer = null;

            // Start next question
            delete this.activeTrivia[channelName]; // Clear current question

            // Pick random question
            const question = this.triviaQuestions[Math.floor(Math.random() * this.triviaQuestions.length)];

            // Store new question
            this.activeTrivia[channelName] = {
                question: question,
                startTime: Date.now(),
                answered: false,
                autoMode: true,
                remainingRounds: remainingRounds
            };

            // Announce question
            this.gamesBotReply(channel, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            if (remainingRounds > 0) {
                const totalRounds = remainingRounds + 1; // We just decremented
                // We need to track the original total differently
                this.gamesBotReply(channel, 'NEXT QUESTION! Category: ' + question.category);
            } else {
                this.gamesBotReply(channel, 'NEXT QUESTION! Category: ' + question.category);
            }
            this.gamesBotReply(channel, 'QUESTION:  ' + question.question);
            this.gamesBotReply(channel, 'You have 45 seconds to answer!');
            this.gamesBotReply(channel, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Set timeout for this question
            this.timeUp(channel);

        }, this.NEXT_QUESTION_DELAY);
    }

    /**
     * Process potential answer in channel
     */
    processAnswer(channel, client, text) {
        const channelName = channel;

        // Check if there's an active question
        if (!this.activeTrivia[channelName] || this.activeTrivia[channelName].answered) {
            return; // No active question
        }

        const trivia = this.activeTrivia[channelName];

        // Check if answer is correct
        if (this.checkAnswer(text, trivia.question.answer)) {
            const timeTaken = Math.floor((Date.now() - trivia.startTime) / 1000);

            // Calculate points based on speed
            let points = 10;
            if (timeTaken <= 5) points = 15; // Fast answer bonus
            else if (timeTaken <= 10) points = 12;

            // Update score
            if (!this.playerScores[client]) {
                this.playerScores[client] = 0;
            }
            this.playerScores[client] += points;

            // Announce winner
            this.gamesBotReply(channel, 'CORRECT! ' + client + ' got it in ' + timeTaken + ' seconds!');
            this.gamesBotReply(channel, '✨ +' + points + ' points! Total score: ' + this.playerScores[client]);

            // Mark as answered
            trivia.answered = true;

            // Auto-continue to next question if in auto mode
            if (trivia.autoMode) {
                this.gamesBotReply(channel, '⏭️  Next question in 5 seconds...');
                this.scheduleNextQuestion(channel, trivia.remainingRounds);
            } else {
                this.gamesBotReply(channel, 'Type !trivia for the next question!');
            }

            this.gamesBotReply(channel, '[' + this.GAMES_BOT_NICK + '] ' + client + ' answered correctly in ' + channelName + ' (+' + points + ' points)');
        }
    }

    /**
     * Show top scores
     */
    showTopScores(channel) {
        const scores = [];
        for (const name in this.playerScores) {
            scores.push({ name: name, score: this.playerScores[name] });
        }

        if (scores.length === 0) {
            this.gamesBotReply(channel, 'No scores yet! Play some trivia to get on the board!');
            return;
        }

        // Sort by score descending
        scores.sort(function (a, b) { return b.score - a.score; });

        this.gamesBotReply(channel, '🏆 TOP TRIVIA PLAYERS 🏆');

        const limit = Math.min(10, scores.length);
        for (const i = 0; i < limit; i++) {
            let medal = '';
            if (i === 0) medal = '🥇';
            else if (i === 1) medal = '🥈';
            else if (i === 2) medal = '🥉';
            else medal = (i + 1) + '.';

            this.gamesBotReply(channel, medal + ' ' + scores[i].name + ': ' + scores[i].score + ' points');
        }
    }

    /**
     * Show player's own score
     */
    showPlayerScore(channel, client) {
        const score = this.playerScores[client] || 0;
        this.gamesBotReply(channel, client + ': You have ' + score + ' points');
    }

    /**
     * GamesBot main message handler
     */

    messageHandle(event) {

        const text = event.message;
        const client = event.nick;
        const channel = event.target;

        // Check for trivia commands
        if (text.charAt(0) === this.GAMES_PREFIX) {
            const parts = text.substring(1).split(/\s+/);
            const command = parts[0].toLowerCase();

            switch (command) {

                case 'quiz':
                case 'quizz':
                case 'trivia': {
                    const rounds = parts.length > 1 ? parts[1] : null;
                    this.startTrivia(channel, rounds);
                    break;
                }
                case 'stop':
                case 'stoptrivia': {
                    // Stop the current trivia game
                    const channelName = channel;
                    if (this.activeTrivia[channelName]) {
                        delete this.activeTrivia[channelName];
                        this.gamesBotReply(channel, '⏹️  Trivia game stopped. Type !trivia to start a new game!');
                    } else {
                        this.gamesBotReply(channel, 'No active trivia game to stop.');
                    }
                    break;
                }
                case 'score':
                    this.showPlayerScore(channel, client);
                    break;

                case 'top':
                case 'scores':
                case 'leaderboard':
                    this.showTopScores(channel);
                    break;

                case 'skip':
                    // Allow users to skip if no one is answering
                    const channelName = channel;
                    if (this.activeTrivia[channelName] && !this.activeTrivia[channelName].answered) {
                        const timeSinceStart = Date.now() - this.activeTrivia[channelName].startTime;
                        if (timeSinceStart > 20000) { // 20 seconds
                            this.gamesBotReply(channel, 'Question skipped. The answer was: ' + this.activeTrivia[channelName].question.answer);
                            this.activeTrivia[channelName].answered = true;
                            this.gamesBotReply(channel, 'Type !trivia for a new question!');
                        } else {
                            this.gamesBotReply(channel, 'You can skip after 20 seconds of no correct answer.');
                        }
                    }
                    break;

                case 'triviahelp':
                case 'gamehelp':
                    this.gamesBotReply(channel, 'GamesBot Commands:');
                    this.gamesBotReply(channel, '!trivia - Start infinite trivia (auto-continues)');
                    this.gamesBotReply(channel, '!trivia <N> - Play N rounds of trivia');
                    this.gamesBotReply(channel, '!stop - Stop the current trivia game');
                    this.gamesBotReply(channel, '!score - Check your score');
                    this.gamesBotReply(channel, '!top - Show leaderboard');
                    this.gamesBotReply(channel, '!skip - Skip current question (after 20s)');
                    this.gamesBotReply(channel, 'Just type your answer in the channel to guess!');
                    break;
            }
        } else {
            // Check if this is an answer to active trivia
            this.processAnswer(channel, client, text);
        }
    }

    /**
     * Welcome message for GamesBot
     */
    joinHandle(event) {
        const client = event.nick;
        const channelName = event.channel;
        if (!this.activeTrivia[channelName]) {
            setTimeout(() => {
                this.bot.notice(client, '' + this.GAMES_BOT_NICK + ' is ready! Type !trivia in any channel to play!');
            }, 3000);
        }
    }



    // GamesBot startup notification
    /*
    log('[' + this.GAMES_BOT_NICK + '] Trivia bot loaded successfully');
    log('[' + this.GAMES_BOT_NICK + '] Nickname "' + this.GAMES_BOT_NICK + '" is now reserved');
    log('[' + this.GAMES_BOT_NICK + '] ' + this.triviaQuestions.length + ' trivia questions loaded');
    log('[' + this.GAMES_BOT_NICK + '] Commands: !trivia, !score, !top, !skip, !triviahelp');
    */
}

module.exports = Trivia;