from flask import Flask, render_template, request, jsonify, session
from PIL import Image
from rembg import remove
import io
import os
import base64
from google.cloud import aiplatform_v1
from google.protobuf import struct_pb2
from dotenv import load_dotenv
import pathlib
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

load_dotenv(pathlib.Path(__file__).parent / '.env')

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
TARGET_SIZE = (512, 512)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_person_image(image):
    width, height = image.size
    if width < 200 or height < 200:
        return False, "Person image too small. Minimum 200x200 pixels required."
    if height < width * 1.2:
        return False, "Please upload a full-body or upper-body image (portrait orientation preferred)."
    return True, "Valid"

def validate_garment_image(image):
    width, height = image.size
    if width < 100 or height < 100:
        return False, "Garment image too small. Minimum 100x100 pixels required."
    if width > 4096 or height > 4096:
        return False, "Garment image too large. Maximum 4096x4096 pixels."
    return True, "Valid"

def preprocess_image(image, remove_bg=False, maintain_aspect=True):
    try:
        if remove_bg:
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='PNG')
            img_byte_arr.seek(0)
            output = remove(img_byte_arr.read())
            image = Image.open(io.BytesIO(output)).convert('RGBA')
            
            # Create white background
            bg = Image.new('RGB', image.size, (255, 255, 255))
            bg.paste(image, mask=image.split()[3] if image.mode == 'RGBA' else None)
            image = bg
        
        image = image.convert('RGB')
        
        if maintain_aspect:
            image.thumbnail(TARGET_SIZE, Image.Resampling.LANCZOS)
            new_image = Image.new('RGB', TARGET_SIZE, (255, 255, 255))
            paste_x = (TARGET_SIZE[0] - image.width) // 2
            paste_y = (TARGET_SIZE[1] - image.height) // 2
            new_image.paste(image, (paste_x, paste_y))
            return new_image
        else:
            return image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
    except Exception as e:
        raise ValueError(f"Image preprocessing failed: {str(e)}")

def call_virtual_tryon_api(person_image, garment_image, garment_type="top"):
    try:
        project_id = os.getenv('GOOGLE_CLOUD_PROJECT')
        location = os.getenv('GOOGLE_CLOUD_LOCATION', 'us-central1')
        credentials_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
        
        if not project_id:
            raise ValueError("GOOGLE_CLOUD_PROJECT not configured")
        
        if not credentials_path:
            raise ValueError("GOOGLE_APPLICATION_CREDENTIALS not configured")
            
        if not os.path.isabs(credentials_path):
            credentials_path = os.path.join(os.path.dirname(__file__), credentials_path)
        
        if not os.path.exists(credentials_path):
            raise ValueError(f"Credentials file not found: {credentials_path}")
        
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = credentials_path
        
        client = aiplatform_v1.PredictionServiceClient(
            client_options={"api_endpoint": f"{location}-aiplatform.googleapis.com"}
        )
        
        # Encode person image
        person_bytes = io.BytesIO()
        person_image.save(person_bytes, format='PNG')
        person_b64 = base64.b64encode(person_bytes.getvalue()).decode('utf-8')
        
        # Use Imagen edit API with mask
        endpoint = f"projects/{project_id}/locations/{location}/publishers/google/models/imagegeneration@006"
        
        # Create mask image for upper body area
        from PIL import ImageDraw
        mask = Image.new('L', person_image.size, 0)
        draw = ImageDraw.Draw(mask)
        width, height = person_image.size
        draw.rectangle([(int(width*0.3), int(height*0.2)), (int(width*0.7), int(height*0.6))], fill=255)
        
        mask_bytes = io.BytesIO()
        mask.save(mask_bytes, format='PNG')
        mask_b64 = base64.b64encode(mask_bytes.getvalue()).decode('utf-8')
        
        instance = struct_pb2.Struct()
        instance.fields["prompt"].string_value = (
            f"A person wearing a perfectly fitted {garment_type} that naturally conforms to their body shape and posture. "
            f"The garment drapes realistically with natural fabric folds and wrinkles. "
            f"Maintain the original lighting, shadows, and skin tone of the person. "
            f"The {garment_type} should blend seamlessly with the person's body, matching the perspective and proportions. "
            f"Photorealistic, high detail, natural appearance, proper fit without distortion."
        )
        instance.fields["image"].struct_value.fields["bytesBase64Encoded"].string_value = person_b64
        instance.fields["mask"].struct_value.fields["image"].struct_value.fields["bytesBase64Encoded"].string_value = mask_b64
        
        parameters = struct_pb2.Struct()
        parameters.fields["sampleCount"].number_value = 1
        parameters.fields["editMode"].string_value = "inpainting-insert"
        
        response = client.predict(
            endpoint=endpoint,
            instances=[instance],
            parameters=parameters
        )
        
        if response.predictions:
            prediction = response.predictions[0]
            
            # Extract base64 image from MapComposite
            if 'bytesBase64Encoded' in prediction:
                result_b64 = prediction['bytesBase64Encoded']
                result_image = Image.open(io.BytesIO(base64.b64decode(result_b64)))
                return result_image, None
        
        return None, "No valid prediction returned from API."
            
    except Exception as e:
        error_msg = str(e)
        if "404" in error_msg:
            return None, "Imagen API endpoint not found. Please verify your project configuration."
        elif "403" in error_msg or "permission" in error_msg.lower():
            return None, "Permission denied. Please check your API credentials and permissions."
        elif "quota" in error_msg.lower():
            return None, "API quota exceeded. Please try again later."
        else:
            return None, f"API Error: {error_msg}"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload():
    if 'person' not in request.files or 'garment' not in request.files:
        return jsonify({'error': 'Both person and garment images are required'}), 400
    
    person_file = request.files['person']
    garment_file = request.files['garment']
    
    if not person_file.filename or not garment_file.filename:
        return jsonify({'error': 'Please select both images'}), 400
    
    if not allowed_file(person_file.filename) or not allowed_file(garment_file.filename):
        return jsonify({'error': 'Invalid file format. Please use PNG or JPEG images only.'}), 400
    
    try:
        # Load images
        try:
            person_image = Image.open(person_file.stream)
            person_image.verify()
            person_file.stream.seek(0)
            person_image = Image.open(person_file.stream)
        except Exception:
            return jsonify({'error': 'Invalid person image file. Please upload a valid image.'}), 400
        
        try:
            garment_image = Image.open(garment_file.stream)
            garment_image.verify()
            garment_file.stream.seek(0)
            garment_image = Image.open(garment_file.stream)
        except Exception:
            return jsonify({'error': 'Invalid garment image file. Please upload a valid image.'}), 400
        
        # Validate images
        valid, msg = validate_person_image(person_image)
        if not valid:
            return jsonify({'error': msg}), 400
        
        valid, msg = validate_garment_image(garment_image)
        if not valid:
            return jsonify({'error': msg}), 400
        
        # Preprocess person image
        person_processed = preprocess_image(person_image, remove_bg=False, maintain_aspect=True)
        
        # Preprocess garment image (with background removal)
        garment_processed = preprocess_image(garment_image, remove_bg=True, maintain_aspect=True)
        
        # Call API
        result_image, error = call_virtual_tryon_api(person_processed, garment_processed)
        
        if error:
            return jsonify({'error': error}), 500
        
        if not result_image:
            return jsonify({'error': 'Failed to generate try-on result. Please try again.'}), 500
        
        # Encode result and person image
        result_bytes = io.BytesIO()
        result_image.save(result_bytes, format='PNG', quality=85)
        result_bytes.seek(0)
        result_b64 = base64.b64encode(result_bytes.getvalue()).decode('utf-8')
        
        person_bytes = io.BytesIO()
        person_processed.save(person_bytes, format='PNG')
        person_bytes.seek(0)
        person_b64 = base64.b64encode(person_bytes.getvalue()).decode('utf-8')
        
        return jsonify({
            'success': True,
            'result_image': f'data:image/png;base64,{result_b64}',
            'person_image': f'data:image/png;base64,{person_b64}'
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'service': 'Virtual Try-On API'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
