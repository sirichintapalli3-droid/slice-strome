import json
import os
import secrets
from datetime import datetime, timedelta

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, jwt_required
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, static_folder='static')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///slice_storm.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'slice-storm-secret-key')
with open(os.path.join(os.path.dirname(__file__), 'level_config.json'), encoding='utf-8') as level_file:
    LEVEL_CONFIG = json.load(level_file)
MAX_LEVEL = len(LEVEL_CONFIG)

DB = SQLAlchemy(app)
JWT = JWTManager(app)
CORS(app)

ACTIVE_SESSIONS = {}
COMPLETED_SESSIONS = set()


class User(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    name = DB.Column(DB.String(80), nullable=False)
    email = DB.Column(DB.String(120), unique=True, nullable=False)
    password_hash = DB.Column(DB.String(255), nullable=False)
    highest_score = DB.Column(DB.Integer, default=0)
    total_games = DB.Column(DB.Integer, default=0)
    total_fruits_sliced = DB.Column(DB.Integer, default=0)
    highest_combo = DB.Column(DB.Integer, default=0)
    created_at = DB.Column(DB.DateTime, default=datetime.utcnow)

    def to_public_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'username': self.name,
            'highestScore': self.highest_score,
            'totalGames': self.total_games,
            'totalFruitsSliced': self.total_fruits_sliced,
            'highestCombo': self.highest_combo,
            'createdAt': self.created_at.isoformat()
        }


class GameResult(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'))
    session_id = DB.Column(DB.String(80), unique=True, nullable=False)
    level = DB.Column(DB.Integer, default=1, nullable=False)
    mode = DB.Column(DB.String(30), default='classic')
    score = DB.Column(DB.Integer, default=0)
    fruits_sliced = DB.Column(DB.Integer, default=0)
    bombs_hit = DB.Column(DB.Integer, default=0)
    max_combo = DB.Column(DB.Integer, default=0)
    duration = DB.Column(DB.Float, default=0.0)
    accuracy = DB.Column(DB.Float, default=0.0)
    status = DB.Column(DB.String(30), default='completed')
    created_at = DB.Column(DB.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'sessionId': self.session_id,
            'level': self.level,
            'mode': self.mode,
            'score': self.score,
            'fruitsSliced': self.fruits_sliced,
            'bombsHit': self.bombs_hit,
            'maxCombo': self.max_combo,
            'duration': self.duration,
            'accuracy': self.accuracy,
            'status': self.status,
            'createdAt': self.created_at.isoformat()
        }


class PlayerProgress(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), unique=True, nullable=False)
    current_level = DB.Column(DB.Integer, default=1, nullable=False)
    unlocked_level = DB.Column(DB.Integer, default=1, nullable=False)
    level_score = DB.Column(DB.Integer, default=0, nullable=False)
    fruits_sliced = DB.Column(DB.Integer, default=0, nullable=False)
    level_complete = DB.Column(DB.Boolean, default=False, nullable=False)
    updated_at = DB.Column(DB.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'currentLevel': self.current_level,
            'unlockedLevel': self.unlocked_level,
            'levelScore': self.level_score,
            'fruitsSliced': self.fruits_sliced,
            'levelComplete': self.level_complete,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


with app.app_context():
    DB.create_all()
    if 'level' not in {column['name'] for column in inspect(DB.engine).get_columns('game_result')}:
        DB.session.execute(text('ALTER TABLE game_result ADD COLUMN level INTEGER NOT NULL DEFAULT 1'))
        DB.session.commit()


@app.get('/')
def index():
    client_build = os.path.join(app.root_path, 'client', 'dist')
    if not os.path.isfile(os.path.join(client_build, 'index.html')):
        return jsonify({'message': 'React client is not built. Run npm run client for development or npm run build first.'}), 503
    return send_from_directory(client_build, 'index.html')


@app.get('/assets/<path:filename>')
def client_asset(filename):
    return send_from_directory(os.path.join(app.root_path, 'client', 'dist', 'assets'), filename)


@app.get('/api/health')
def health():
    return jsonify({'status': 'ok', 'message': 'SLICE STORM backend is running'}), 200


@app.post('/api/auth/register')
def register_user():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not name or not email or len(password) < 6:
        return jsonify({'message': 'Name, valid email, and at least 6-character password are required'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'message': 'This email is already registered'}), 409

    user = User(name=name, email=email, password_hash=generate_password_hash(password))
    DB.session.add(user)
    DB.session.commit()

    access_token = create_access_token(identity=str(user.id))
    return jsonify({'token': access_token, 'user': user.to_public_dict()}), 201


@app.post('/api/auth/login')
def login_user():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'message': 'Invalid credentials'}), 401

    access_token = create_access_token(identity=str(user.id))
    return jsonify({'token': access_token, 'user': user.to_public_dict()}), 200


@app.get('/api/auth/me')
@jwt_required()
def get_current_user():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    return jsonify({'user': user.to_public_dict()}), 200


@app.put('/api/auth/me')
@jwt_required()
def update_current_user():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    if not name or len(name) > 80 or not email or len(email) > 120 or '@' not in email:
        return jsonify({'message': 'A valid name and email are required'}), 400
    duplicate = User.query.filter(User.email == email, User.id != user_id).first()
    if duplicate:
        return jsonify({'message': 'This email is already registered'}), 409
    user.name = name
    user.email = email
    DB.session.commit()
    return jsonify({'user': user.to_public_dict()}), 200


@app.get('/api/profile')
@jwt_required()
def get_player_profile():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    progress = get_or_create_progress(user_id)
    games = GameResult.query.filter_by(user_id=user_id).order_by(GameResult.created_at.desc()).all()
    sliced = user.total_fruits_sliced or 0
    best_combo = user.highest_combo or 0
    completed_levels = max(0, progress.unlocked_level - 1)
    achievements = [
        {'id': 'first-slice', 'name': 'First Slice', 'description': 'Slice your first fruit', 'unlocked': sliced >= 1},
        {'id': 'fruit-rookie', 'name': 'Fruit Rookie', 'description': 'Slice 25 fruits', 'unlocked': sliced >= 25},
        {'id': 'combo-master', 'name': 'Combo Master', 'description': 'Reach a combo of 10', 'unlocked': best_combo >= 10},
        {'id': 'level-champion', 'name': 'Level Champion', 'description': 'Complete 5 levels', 'unlocked': completed_levels >= 5},
        {'id': 'fruit-legend', 'name': 'Fruit Legend', 'description': 'Slice 500 fruits', 'unlocked': sliced >= 500}
    ]
    return jsonify({
        'user': user.to_public_dict(),
        'progress': progress.to_dict(),
        'stats': {
            'totalGames': user.total_games or 0,
            'highestScore': user.highest_score or 0,
            'totalScore': sum(game.score for game in games),
            'totalFruitsSliced': sliced,
            'highestCombo': best_combo,
            'currentLevel': progress.current_level,
            'levelsCompleted': completed_levels,
            'totalPlayTime': sum(game.duration for game in games)
        },
        'achievements': achievements,
        'history': [game.to_dict() for game in games[:20]]
    }), 200


def get_or_create_progress(user_id):
    progress = PlayerProgress.query.filter_by(user_id=user_id).first()
    if progress is None:
        progress = PlayerProgress(user_id=user_id)
        DB.session.add(progress)
        DB.session.commit()
    return progress


@app.get('/api/progress')
@jwt_required()
def get_player_progress():
    user_id = int(get_jwt_identity())
    progress = get_or_create_progress(user_id)
    return jsonify({'progress': progress.to_dict(), 'levels': LEVEL_CONFIG}), 200


@app.put('/api/progress')
@jwt_required()
def save_player_progress():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    progress = get_or_create_progress(user_id)
    current_level = data.get('currentLevel')

    if not isinstance(current_level, int) or current_level < 1 or current_level > MAX_LEVEL:
        return jsonify({'message': 'Current level is invalid'}), 400

    if current_level != progress.current_level:
        if not progress.level_complete or current_level != min(progress.unlocked_level, MAX_LEVEL):
            return jsonify({'message': 'Complete the current level before advancing'}), 409
        progress.current_level = current_level
        progress.level_score = 0
        progress.fruits_sliced = 0
        progress.level_complete = False
    else:
        level_score = data.get('levelScore', progress.level_score)
        fruits_sliced = data.get('fruitsSliced', progress.fruits_sliced)
        if not isinstance(level_score, int) or not isinstance(fruits_sliced, int) or level_score < 0 or fruits_sliced < 0:
            return jsonify({'message': 'Level progress is invalid'}), 400
        progress.level_score = max(progress.level_score, level_score)
        progress.fruits_sliced = max(progress.fruits_sliced, fruits_sliced)

    DB.session.commit()
    return jsonify({'progress': progress.to_dict()}), 200


@app.post('/api/progress/complete')
@jwt_required()
def complete_player_level():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    progress = get_or_create_progress(user_id)
    level = data.get('level')
    level_score = data.get('levelScore')
    fruits_sliced = data.get('fruitsSliced', 0)

    if not isinstance(level, int) or level != progress.current_level:
        return jsonify({'message': 'Level does not match saved progress'}), 409
    if not isinstance(level_score, int) or not isinstance(fruits_sliced, int) or level_score < 0 or fruits_sliced < 0:
        return jsonify({'message': 'Level result is invalid'}), 400
    if level_score < LEVEL_CONFIG[level - 1]['targetScore']:
        return jsonify({'message': 'The level target score has not been reached'}), 409

    progress.level_score = max(progress.level_score, level_score)
    progress.fruits_sliced = max(progress.fruits_sliced, fruits_sliced)
    progress.level_complete = True
    progress.unlocked_level = min(MAX_LEVEL, max(progress.unlocked_level, level + 1))
    DB.session.commit()
    return jsonify({'progress': progress.to_dict()}), 200


@app.post('/api/games/start')
@jwt_required(optional=True)
def start_game():
    data = request.get_json(silent=True) or {}
    mode = data.get('mode', 'classic')
    user_id = get_jwt_identity()
    if user_id:
        user_id = int(user_id)
        progress = get_or_create_progress(user_id)
        if data.get('level', progress.current_level) != progress.current_level:
            return jsonify({'message': 'Game level does not match saved progress'}), 409
        level = progress.current_level
    else:
        level = data.get('level', 1)
        if not isinstance(level, int) or level < 1 or level > MAX_LEVEL:
            return jsonify({'message': 'Game level is invalid'}), 400

    session_id = secrets.token_urlsafe(12)
    ACTIVE_SESSIONS[session_id] = {'userId': user_id, 'mode': mode, 'level': level, 'status': 'active'}

    return jsonify({'session': {'id': session_id, 'mode': mode, 'status': 'active'}}), 201


@app.post('/api/games/complete')
@jwt_required(optional=True)
def complete_game():
    data = request.get_json(silent=True) or {}
    session_id = data.get('gameId') or data.get('session_id')
    if not session_id:
        return jsonify({'message': 'Game session id is required'}), 400

    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        return jsonify({'message': 'Unknown or expired game session'}), 404

    if session_id in COMPLETED_SESSIONS:
        return jsonify({'message': 'Session already completed'}), 409

    score = int(data.get('score', 0))
    fruits_sliced = int(data.get('fruitsSliced', 0))
    bombs_hit = int(data.get('bombsHit', 0))
    max_combo = int(data.get('maxCombo', 0))
    duration = float(data.get('duration', 0))
    accuracy = float(data.get('accuracy', 0))

    if score < 0 or fruits_sliced < 0 or bombs_hit < 0 or duration < 0 or duration > 3600:
        return jsonify({'message': 'Game data is invalid'}), 400

    user_id = session.get('userId')
    identity = get_jwt_identity()
    if identity and user_id is None:
        user_id = int(identity)

    result = GameResult(
        user_id=user_id,
        session_id=session_id,
        level=session.get('level', 1),
        mode=session.get('mode', 'classic'),
        score=score,
        fruits_sliced=fruits_sliced,
        bombs_hit=bombs_hit,
        max_combo=max_combo,
        duration=duration,
        accuracy=accuracy,
        status='completed'
    )
    DB.session.add(result)
    DB.session.commit()

    if user_id:
        user = User.query.get(user_id)
        if user:
            user.highest_score = max(user.highest_score or 0, score)
            user.total_games += 1
            user.total_fruits_sliced += fruits_sliced
            user.highest_combo = max(user.highest_combo or 0, max_combo)
            DB.session.commit()

    COMPLETE_SESSIONS = COMPLETED_SESSIONS
    COMPLETE_SESSIONS.add(session_id)
    ACTIVE_SESSIONS.pop(session_id, None)

    return jsonify({'game': result.to_dict()}), 201


@app.get('/api/games/history')
@jwt_required()
def game_history():
    user_id = int(get_jwt_identity())
    entries = GameResult.query.filter_by(user_id=user_id).order_by(GameResult.created_at.desc()).all()
    return jsonify({'history': [entry.to_dict() for entry in entries]}), 200


@app.get('/api/leaderboard')
@jwt_required(optional=True)
def leaderboard():
    period = request.args.get('period', 'all')
    if period not in {'all', 'week', 'day'}:
        return jsonify({'message': 'Leaderboard period must be all, week, or day'}), 400
    query = GameResult.query.filter_by(status='completed')
    if period == 'week':
        query = query.filter(GameResult.created_at >= datetime.utcnow() - timedelta(days=7))
    elif period == 'day':
        query = query.filter(GameResult.created_at >= datetime.utcnow() - timedelta(days=1))

    best_by_player = {}
    for game in query.order_by(GameResult.score.desc(), GameResult.created_at.asc()).all():
        key = f'user-{game.user_id}' if game.user_id else f'guest-{game.session_id}'
        best_by_player.setdefault(key, game)

    rows = []
    for key, game in best_by_player.items():
        user = User.query.get(game.user_id) if game.user_id else None
        progress = PlayerProgress.query.filter_by(user_id=game.user_id).first() if user else None
        rows.append({
            'rank': 0,
            'name': user.name if user else 'Guest',
            'score': game.score,
            'mode': game.mode,
            'level': progress.current_level if progress else game.level,
            'fruitsSliced': user.total_fruits_sliced if user else game.fruits_sliced,
            'levelsCompleted': max(0, progress.unlocked_level - 1) if progress else 0,
            'createdAt': game.created_at.isoformat(),
            'playerKey': key
        })
    rows.sort(key=lambda row: (-row['score'], row['createdAt']))
    for index, row in enumerate(rows, start=1):
        row['rank'] = index
    identity = get_jwt_identity()
    current_rank = next((row['rank'] for row in rows if identity and row['playerKey'] == f'user-{identity}'), None)
    for row in rows:
        row.pop('playerKey', None)
    return jsonify({'leaderboard': rows[:100], 'period': period, 'currentPlayerRank': current_rank}), 200


@app.get('/api/leaderboard/me')
@jwt_required()
def my_leaderboard():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    user_games = GameResult.query.filter_by(user_id=user_id).all()
    best_score = max((game.score for game in user_games), default=0)
    leaderboard_rows = GameResult.query.filter_by(status='completed').order_by(GameResult.score.desc()).all()
    position = None
    for index, game in enumerate(leaderboard_rows, start=1):
        if game.user_id == user_id:
            position = index
            break

    progress = PlayerProgress.query.filter_by(user_id=user_id).first()
    return jsonify({
        'name': user.name,
        'bestScore': best_score,
        'position': position,
        'totalGames': len(user_games),
        'currentLevel': progress.current_level if progress else 1,
        'levelsCompleted': max(0, progress.unlocked_level - 1) if progress else 0,
        'totalFruitsSliced': user.total_fruits_sliced or 0
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
